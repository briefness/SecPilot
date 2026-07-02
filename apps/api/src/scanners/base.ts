import { Severity } from '@prisma/client';

export interface ScannerFinding {
  title: string;
  severity: Severity;
  cwe?: string;
  cve?: string;
  cvss?: number;
  description?: string;
  location?: string;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  scannerRef?: string;
}

export interface ScannerResult {
  success: boolean;
  findings: ScannerFinding[];
  durationSeconds?: number;
  error?: string;
  rawResponse?: unknown;
}

export interface ScannerOptions {
  targetUrl?: string;
  branch?: string;
  commitHash?: string;
  projectKey?: string;
  apiUrl?: string;
  apiToken?: string;
  traceId?: string;
  extraParams?: Record<string, unknown>;
}

export abstract class BaseScanner {
  abstract readonly name: string;
  abstract readonly scanType: string;

  abstract scan(options: ScannerOptions): Promise<ScannerResult>;

  protected mapSeverity(level: string): Severity {
    const l = level.toLowerCase().trim();
    if (['critical', 'blocker', 'urgent'].includes(l)) return Severity.CRITICAL;
    if (['high', 'major', 'important'].includes(l)) return Severity.HIGH;
    if (['medium', 'moderate', 'normal'].includes(l)) return Severity.MEDIUM;
    if (['low', 'minor', 'low'].includes(l)) return Severity.LOW;
    return Severity.INFO;
  }

  protected extractCwe(cweStr?: string | number): string | undefined {
    if (!cweStr) return undefined;
    const s = String(cweStr);
    const match = s.match(/CWE-(\d+)/i) || s.match(/(\d+)/);
    return match ? `CWE-${match[1]}` : undefined;
  }
}
