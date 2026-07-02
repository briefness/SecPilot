import { BaseScanner, ScannerResult, ScannerOptions, ScannerFinding } from './base.js';
import { config } from '../config.js';
import { Severity } from '@prisma/client';
import { basename } from 'node:path';

interface MobSFScanResponse {
  scan_type?: string;
  version?: string;
  filename?: string;
  app_name?: string;
  package_name?: string;
  md5?: string;
  sha1?: string;
  sha256?: string;
  status?: string;
}

interface MobSFReport {
  app_name?: string;
  package_name?: string;
  version_name?: string;
  size?: string;
  platform?: string;
  findings?: {
    critical?: Array<Record<string, unknown>>;
    high?: Array<Record<string, unknown>>;
    medium?: Array<Record<string, unknown>>;
    low?: Array<Record<string, unknown>>;
    info?: Array<Record<string, unknown>>;
  };
  severity?: {
    critical?: number;
    high?: number;
    medium?: number;
    low?: number;
    info?: number;
  };
}

export class MobSFScanner extends BaseScanner {
  readonly name = 'MobSF';
  readonly scanType = 'MOBILE_MOBSF';

  private get baseUrl(): string {
    return config.MOBSF_URL || 'http://localhost:8000';
  }

  private get apiKey(): string | undefined {
    return config.MOBSF_API_KEY;
  }

  get enabled(): boolean {
    return !!this.baseUrl && !!this.apiKey;
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    bodyInit?: any,
    contentType?: string
  ): Promise<T> {
    const url = `${this.baseUrl.replace(/\/$/, '')}/api/v1${path}`;

    const headers: Record<string, string> = {
      'Authorization': this.apiKey || '',
    };
    if (contentType) headers['Content-Type'] = contentType;

    const res = await fetch(url, {
      method,
      headers,
      body: method === 'POST' ? bodyInit : undefined,
      signal: AbortSignal.timeout(300000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`MobSF API error: ${res.status} ${text}`);
    }

    return res.json() as Promise<T>;
  }

  async scan(options: ScannerOptions): Promise<ScannerResult> {
    const startTime = Date.now();
    const filePath = options.extraParams?.filePath as string | undefined;

    if (!filePath) {
      return {
        success: false,
        findings: [],
        error: 'APK/IPA file path required',
      };
    }

    if (!this.enabled) {
      return {
        success: false,
        findings: [],
        error: 'MobSF not configured',
      };
    }

    try {
      const uploadResult = await this.uploadAndScan(filePath);
      const hash = uploadResult.md5 || uploadResult.sha256;

      if (!hash) {
        return {
          success: false,
          findings: [],
          error: 'Failed to get scan hash',
        };
      }

      await this.waitForScan(hash);

      const report = await this.getReport(hash);
      const findings = this.parseReport(report);
      const durationSeconds = Math.floor((Date.now() - startTime) / 1000);

      return {
        success: true,
        findings,
        durationSeconds,
        rawResponse: { appName: report.app_name, severity: report.severity },
      };
    } catch (error) {
      return {
        success: false,
        findings: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async uploadAndScan(filePath: string): Promise<MobSFScanResponse> {
    const formData = new FormData();
    const fileName = basename(filePath);

    const fileBuffer = await this.readFileAsBuffer(filePath);
    const blob = new Blob([fileBuffer]);
    formData.append('file', blob, fileName);

    return this.request<MobSFScanResponse>('POST', '/upload', formData);
  }

  private async readFileAsBuffer(filePath: string): Promise<Buffer> {
    const fs = await import('node:fs/promises');
    return fs.readFile(filePath);
  }

  private async waitForScan(hash: string, maxWaitMs = 600000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      try {
        const status = await this.request<{ status?: string; done?: boolean }>(
          'POST',
          '/scan_status',
          new URLSearchParams({ hash }),
          'application/x-www-form-urlencoded'
        );
        if (status.done || status.status === 'completed') return;
      } catch {
      }
      await new Promise(r => setTimeout(r, 10000));
    }
  }

  private async getReport(hash: string): Promise<MobSFReport> {
    return this.request<MobSFReport>(
      'POST',
      '/report_json',
      new URLSearchParams({ hash }),
      'application/x-www-form-urlencoded'
    );
  }

  private parseReport(report: MobSFReport): ScannerFinding[] {
    const findings: ScannerFinding[] = [];

    const severityMap: Record<string, Severity> = {
      critical: Severity.CRITICAL,
      high: Severity.HIGH,
      medium: Severity.MEDIUM,
      low: Severity.LOW,
      info: Severity.INFO,
    };

    const levels = ['critical', 'high', 'medium', 'low', 'info'] as const;

    for (const level of levels) {
      const items = report.findings?.[level];
      if (!items || items.length === 0) continue;

      for (const item of items) {
        const itemAny = item as Record<string, unknown>;
        const title = (itemAny.title as string) || (itemAny.name as string) || `${level} severity finding`;
        const cwe = this.extractCwe(itemAny.cwe as string | number | undefined);
        const description = (itemAny.description as string) || (itemAny.summary as string);
        const filePath = (itemAny.file as string) || (itemAny.path as string);

        findings.push({
          title,
          severity: severityMap[level],
          cwe,
          description,
          filePath,
          location: filePath,
          scannerRef: (itemAny.id as string) || (itemAny.reference as string),
        });
      }
    }

    return findings;
  }
}

export const mobsfScanner = new MobSFScanner();
