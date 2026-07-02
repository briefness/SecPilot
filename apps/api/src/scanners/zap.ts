import { BaseScanner, ScannerResult, ScannerOptions, ScannerFinding } from './base.js';
import { config } from '../config.js';
import { Severity } from '@prisma/client';

interface ZapAlert {
  pluginid: string;
  alertRef: string;
  name: string;
  riskcode: string;
  confidence: string;
  riskdesc: string;
  desc: string;
  solution?: string;
  other?: string;
  reference?: string;
  cweid?: string;
  wascid?: string;
  sourceid?: string;
  instances?: Array<{
    uri: string;
    method: string;
    param?: string;
    attack?: string;
    evidence?: string;
  }>;
  count?: string;
}

interface ZapAlertsResponse {
  alerts: ZapAlert[];
}

interface ZapScanStatusResponse {
  status: string;
  progress: string;
}

interface ZapSpiderStatusResponse {
  status: string;
  progress: string;
  results: string[];
}

export class ZapScanner extends BaseScanner {
  readonly name = 'OWASP ZAP';
  readonly scanType = 'DYNAMIC_DAST';

  private get baseUrl(): string {
    return config.ZAP_API_URL || 'http://localhost:8080';
  }

  private get apiKey(): string | undefined {
    return config.ZAP_API_KEY;
  }

  get enabled(): boolean {
    return !!this.baseUrl;
  }

  private async request<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    let url = `${this.baseUrl.replace(/\/$/, '')}${path}`;
    const allParams = { ...params };
    if (this.apiKey) allParams['apikey'] = this.apiKey;

    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(allParams)) {
      if (v !== undefined && v !== null) usp.append(k, String(v));
    }
    const qs = usp.toString();
    if (qs) url += `?${qs}`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(120000),
    });

    if (!res.ok) {
      throw new Error(`ZAP API error: ${res.status}`);
    }

    return res.json() as Promise<T>;
  }

  async scan(options: ScannerOptions): Promise<ScannerResult> {
    const startTime = Date.now();
    const targetUrl = options.targetUrl;

    if (!targetUrl) {
      return {
        success: false,
        findings: [],
        error: 'Target URL required',
      };
    }

    if (!this.enabled) {
      return {
        success: false,
        findings: [],
        error: 'ZAP not configured',
      };
    }

    try {
      if (options.traceId) {
        await this.setGlobalHeader('X-B3-TraceId', options.traceId).catch(() => {});
        await this.setGlobalHeader('X-SecOps-Simulation', 'True').catch(() => {});
      }

      const spiderId = await this.startSpider(targetUrl);
      await this.waitForSpider(spiderId);

      const scanId = await this.startActiveScan(targetUrl);
      await this.waitForScan(scanId);

      const alertsData = await this.request<ZapAlertsResponse>('/JSON/alert/view/alerts/', {
        baseurl: targetUrl,
      });

      const findings = this.parseAlerts(alertsData.alerts);
      const durationSeconds = Math.floor((Date.now() - startTime) / 1000);

      return {
        success: true,
        findings,
        durationSeconds,
        rawResponse: { alertCount: alertsData.alerts.length },
      };
    } catch (error) {
      return {
        success: false,
        findings: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async startSpider(url: string): Promise<string> {
    const data = await this.request<{ scan?: string; scanId?: string }>('/JSON/spider/action/scan/', {
      url,
      maxChildren: 10,
      recurse: true,
    });
    return data.scan || data.scanId || '0';
  }

  private async waitForSpider(scanId: string, maxWaitMs = 300000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const data = await this.request<ZapSpiderStatusResponse>('/JSON/spider/view/status/', { scanId });
      if (parseInt(data.status) >= 100) return;
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  private async startActiveScan(url: string): Promise<string> {
    const data = await this.request<{ scan?: string; scanId?: string }>('/JSON/ascan/action/scan/', {
      url,
      scanPolicyName: 'Default Policy',
    });
    return data.scan || data.scanId || '0';
  }

  private async waitForScan(scanId: string, maxWaitMs = 600000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const data = await this.request<ZapScanStatusResponse>('/JSON/ascan/view/status/', { scanId });
      if (parseInt(data.status) >= 100) return;
      await new Promise(r => setTimeout(r, 10000));
    }
  }

  private parseAlerts(alerts: ZapAlert[]): ScannerFinding[] {
    const findings: ScannerFinding[] = [];

    for (const alert of alerts) {
      const riskCode = parseInt(alert.riskcode);
      if (riskCode === 0) continue;

      const firstInstance = alert.instances?.[0];
      const severity = this.mapRiskLevel(riskCode);

      findings.push({
        title: alert.name,
        severity,
        cwe: alert.cweid ? `CWE-${alert.cweid}` : undefined,
        description: alert.desc,
        location: firstInstance?.uri,
        filePath: firstInstance?.uri,
        scannerRef: alert.pluginid,
      });
    }

    return findings;
  }

  private mapRiskLevel(riskCode: number): Severity {
    switch (riskCode) {
      case 3: return Severity.CRITICAL;
      case 2: return Severity.HIGH;
      case 1: return Severity.MEDIUM;
      default: return Severity.LOW;
    }
  }

  async getAlerts(targetUrl: string): Promise<ZapAlert[]> {
    const data = await this.request<ZapAlertsResponse>('/JSON/alert/view/alerts/', {
      baseurl: targetUrl,
    });
    return data.alerts;
  }

  private async setGlobalHeader(name: string, value: string): Promise<void> {
    const ruleId = `secops-${name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    try {
      await this.request('/JSON/replacer/action/addRule/', {
        id: ruleId,
        enabled: 'true',
        description: `SecOps ${name}`,
        type: 10,
        match: name,
        replacement: value,
        matchregex: 'false',
        strmatchregex: 'false',
        initiators: '0,1,2,3,4,5,6,7',
        url: '',
      });
    } catch {
    }
  }
}

export const zapScanner = new ZapScanner();
