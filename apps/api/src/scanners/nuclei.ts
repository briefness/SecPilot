import { BaseScanner, ScannerResult, ScannerOptions, ScannerFinding } from './base.js';
import { config } from '../config.js';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

interface NucleiResult {
  'template-id'?: string;
  'template-url'?: string;
  info?: {
    name?: string;
    severity?: string;
    description?: string;
    reference?: string[];
    tags?: string[];
    classification?: {
      'cve-id'?: string[];
      'cwe-id'?: string[];
      'cvss-metrics'?: string;
      'cvss-score'?: number;
    };
  };
  'matched-at'?: string;
  host?: string;
  type?: string;
  result?: unknown;
}

export class NucleiScanner extends BaseScanner {
  readonly name = 'Nuclei';
  readonly scanType = 'API_NUCLEI';

  private get binaryPath(): string {
    return config.NUCLEI_PATH || 'nuclei';
  }

  get enabled(): boolean {
    return !!this.binaryPath;
  }

  async scan(options: ScannerOptions): Promise<ScannerResult> {
    const startTime = Date.now();
    const target = options.targetUrl;

    if (!target) {
      return {
        success: false,
        findings: [],
        error: 'Target URL required',
      };
    }

    try {
      const args = ['-u', target, '-jsonl'];

      if (options.traceId) {
        args.push('-H', `X-B3-TraceId: ${options.traceId}`);
        args.push('-H', 'X-SecOps-Simulation: True');
      }

      if (options.extraParams?.templates) {
        args.push('-t', options.extraParams.templates as string);
      }
      if (options.extraParams?.severity) {
        args.push('-severity', options.extraParams.severity as string);
      }
      if (options.extraParams?.rateLimit) {
        args.push('-rate-limit', String(options.extraParams.rateLimit));
      }
      if (options.extraParams?.timeout) {
        args.push('-timeout', String(options.extraParams.timeout));
      }

      let stdout = '';
      try {
        const cmd = `${this.binaryPath} ${args.join(' ')}`;
        const result = await execAsync(cmd, { timeout: 600000, maxBuffer: 50 * 1024 * 1024 });
        stdout = result.stdout;
      } catch (err: any) {
        if (err.code !== 0 && err.code !== 1) {
          throw err;
        }
        stdout = err.stdout || '';
      }

      const results = this.parseJsonLines(stdout);
      const findings = this.resultsToFindings(results);
      const durationSeconds = Math.floor((Date.now() - startTime) / 1000);

      return {
        success: true,
        findings,
        durationSeconds,
        rawResponse: { count: findings.length },
      };
    } catch (error) {
      return {
        success: false,
        findings: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private parseJsonLines(output: string): NucleiResult[] {
    try {
      const lines = output.trim().split('\n').filter(Boolean);
      return lines.map(line => JSON.parse(line));
    } catch {
      return [];
    }
  }

  private resultsToFindings(results: NucleiResult[]): ScannerFinding[] {
    const findings: ScannerFinding[] = [];

    for (const result of results) {
      const info = result.info;
      if (!info?.name) continue;

      const cve = info.classification?.['cve-id']?.[0];
      const cwe = info.classification?.['cwe-id']?.[0];
      const cvss = info.classification?.['cvss-score'];

      findings.push({
        title: info.name,
        severity: this.mapSeverity(info.severity || 'info'),
        cve,
        cwe: this.extractCwe(cwe),
        description: info.description,
        location: result['matched-at'] || result.host,
        scannerRef: result['template-id'],
        cvss,
      });
    }

    return findings;
  }

  async scanMultiple(targets: string[], templates?: string[]): Promise<ScannerResult> {
    const startTime = Date.now();
    let tmpDir: string | null = null;

    try {
      tmpDir = await mkdtemp(join(tmpdir(), 'nuclei-multi-'));
      const targetsFile = join(tmpDir, 'targets.txt');
      const outputFile = join(tmpDir, 'nuclei-results.json');

      const fs = await import('node:fs/promises');
      await fs.writeFile(targetsFile, targets.join('\n'));

      const args = ['-l', targetsFile, '-jsonl', '-o', outputFile];
      if (templates?.length) args.push('-t', templates.join(','));

      try {
        await execFileAsync(this.binaryPath, args, { timeout: 1_800_000 });
      } catch (err: any) {
        if (err.code !== 0 && err.code !== 1) throw err;
      }

      const results = await this.parseJsonOutput(outputFile);
      const findings = this.resultsToFindings(results);
      const durationSeconds = Math.floor((Date.now() - startTime) / 1000);

      return {
        success: true,
        findings,
        durationSeconds,
      };
    } catch (error) {
      return {
        success: false,
        findings: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      if (tmpDir) {
        const fs = await import('node:fs/promises');
        fs.rm(tmpDir, { recursive: true }).catch(() => {});
      }
    }
  }
}

export const nucleiScanner = new NucleiScanner();
