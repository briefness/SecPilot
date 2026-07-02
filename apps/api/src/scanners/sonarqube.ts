import { BaseScanner, ScannerResult, ScannerOptions, ScannerFinding } from './base.js';
import { config } from '../config.js';

interface SonarIssue {
  key: string;
  rule: string;
  severity: string;
  component: string;
  project: string;
  line?: number;
  message: string;
  type: string;
  status: string;
}

interface SonarIssuesResponse {
  total: number;
  issues: SonarIssue[];
}

interface SonarMeasure {
  metric: string;
  value: string;
}

interface SonarMeasureResponse {
  component: {
    measures: SonarMeasure[];
  };
}

export class SonarQubeScanner extends BaseScanner {
  readonly name = 'SonarQube';
  readonly scanType = 'STATIC_SAST';

  private get baseUrl(): string {
    return config.SONARQUBE_URL || 'http://localhost:9000';
  }

  private get token(): string | undefined {
    return config.SONARQUBE_TOKEN;
  }

  get enabled(): boolean {
    return !!this.token && !!this.baseUrl;
  }

  private async request<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    let url = `${this.baseUrl.replace(/\/$/, '')}/api${path}`;
    if (params) {
      const usp = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) usp.append(k, String(v));
      }
      const qs = usp.toString();
      if (qs) url += `?${qs}`;
    }

    const res = await fetch(url, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`${this.token}:`).toString('base64')}`,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      throw new Error(`SonarQube API error: ${res.status}`);
    }

    return res.json() as Promise<T>;
  }

  async scan(options: ScannerOptions): Promise<ScannerResult> {
    const startTime = Date.now();
    const projectKey = options.projectKey || options.extraParams?.projectKey as string;

    if (!this.enabled) {
      return {
        success: false,
        findings: [],
        error: 'SonarQube not configured',
      };
    }

    try {
      if (!projectKey) {
        return { success: true, findings: [], durationSeconds: 0 };
      }

      const issuesData = await this.request<SonarIssuesResponse>('/issues/search', {
        componentKeys: projectKey,
        types: 'VULNERABILITY,BUG,CODE_SMELL',
        severities: 'CRITICAL,MAJOR,MINOR,INFO',
        statuses: 'OPEN,REOPENED,CONFIRMED',
        ps: 500,
      });

      const findings: ScannerFinding[] = issuesData.issues
        .filter((issue) => issue.type === 'VULNERABILITY' || issue.type === 'BUG')
        .map((issue) => ({
          title: issue.message,
          severity: this.mapSonarSeverity(issue.severity),
          cwe: this.extractCweFromRule(issue.rule),
          description: `Rule: ${issue.rule}, Type: ${issue.type}`,
          filePath: issue.component,
          lineStart: issue.line,
          lineEnd: issue.line ? issue.line + 1 : undefined,
          location: issue.line ? `${issue.component}:${issue.line}` : issue.component,
          scannerRef: issue.key,
        }));

      const durationSeconds = Math.floor((Date.now() - startTime) / 1000);

      return {
        success: true,
        findings,
        durationSeconds,
        rawResponse: { total: issuesData.total },
      };
    } catch (error) {
      return {
        success: false,
        findings: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getProjectMetrics(projectKey: string): Promise<Record<string, string>> {
    if (!this.enabled) return {};

    try {
      const data = await this.request<SonarMeasureResponse>('/measures/component', {
        component: projectKey,
        metricKeys: 'vulnerabilities,bugs,code_smells,coverage,duplicated_lines_density,ncloc',
      });

      const result: Record<string, string> = {};
      for (const m of data.component.measures) {
        result[m.metric] = m.value;
      }
      return result;
    } catch {
      return {};
    }
  }

  private mapSonarSeverity(severity: string): import('@prisma/client').Severity {
    const map: Record<string, import('@prisma/client').Severity> = {
      'BLOCKER': 'CRITICAL',
      'CRITICAL': 'HIGH',
      'MAJOR': 'MEDIUM',
      'MINOR': 'LOW',
      'INFO': 'INFO',
    };
    return map[severity.toUpperCase()] || 'INFO';
  }

  private extractCweFromRule(rule: string): string | undefined {
    const cweMatch = rule.match(/cwe[:_-]?(\d+)/i);
    return cweMatch ? `CWE-${cweMatch[1]}` : undefined;
  }
}

export const sonarQubeScanner = new SonarQubeScanner();
