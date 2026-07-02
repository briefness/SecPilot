import { BaseScanner, ScannerResult, ScannerOptions, ScannerFinding } from './base.js';
import { config } from '../config.js';
import { Severity } from '@prisma/client';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, unlink, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { runDocker, isDockerAvailable } from '../utils/docker.js';

const execFileAsync = promisify(execFile);

const DOCKER_IMAGE = 'ghcr.io/google/osv-scanner:latest';

interface OSVVulnerability {
  id: string;
  modified?: string;
  published?: string;
  aliases?: string[];
  summary?: string;
  details?: string;
  severity?: Array<{ type: string; score: string }>;
  affected?: Array<{
    package: { name: string; ecosystem: string };
    ranges?: Array<{ type: string; events: Array<Record<string, string>> }>;
    versions?: string[];
  }>;
  database_specific?: { severity?: string };
}

interface OSVScanResult {
  results?: Array<{
    target: string;
    pkg: { name: string; version: string; ecosystem: string };
    vulns: OSVVulnerability[];
    groups?: Array<{ ids: string[] }>;
  }>;
}

export class OSVScanner extends BaseScanner {
  readonly name = 'OSV-Scanner';
  readonly scanType = 'STATIC_SCA';

  private get binaryPath(): string {
    return config.OSV_SCANNER_PATH || 'osv-scanner';
  }

  private _dockerAvailable: boolean | null = null;

  async checkEnabled(): Promise<boolean> {
    if (config.OSV_SCANNER_PATH) return true;
    try {
      await execFileAsync('which', [this.binaryPath], { timeout: 5000 });
      return true;
    } catch {
      // not found locally, check docker
    }
    if (this._dockerAvailable === null) {
      this._dockerAvailable = await isDockerAvailable();
    }
    return this._dockerAvailable;
  }

  get enabled(): boolean {
    return true;
  }

  async scan(options: ScannerOptions): Promise<ScannerResult> {
    const startTime = Date.now();

    if (!options.extraParams?.lockfilePath && !options.extraParams?.sbomPath && !options.extraParams?.directory) {
      return {
        success: false,
        findings: [],
        error: 'No lockfile, SBOM path, or directory provided',
      };
    }

    let tmpDir: string | null = null;

    try {
      const localAvailable = await this.localBinaryAvailable();
      let output: OSVScanResult;

      if (localAvailable) {
        tmpDir = await mkdtemp(join(tmpdir(), 'osv-scan-'));
        const outputFile = join(tmpDir, 'osv-results.json');
        await this.runLocal(options, outputFile);
        output = JSON.parse(await readFile(outputFile, 'utf-8')) as OSVScanResult;
      } else {
        output = await this.runDocker(options);
      }

      const findings = this.parseResults(output);
      const durationSeconds = Math.floor((Date.now() - startTime) / 1000);

      return {
        success: true,
        findings,
        durationSeconds,
        rawResponse: output,
      };
    } catch (error) {
      return {
        success: false,
        findings: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      if (tmpDir) {
        rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  }

  private async localBinaryAvailable(): Promise<boolean> {
    if (config.OSV_SCANNER_PATH) return true;
    try {
      await execFileAsync('which', [this.binaryPath], { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  private async runLocal(options: ScannerOptions, outputFile: string): Promise<void> {
    const args: string[] = ['--format', 'json', '--output', outputFile];

    if (options.extraParams?.lockfilePath) {
      args.push('--lockfile', options.extraParams.lockfilePath as string);
    }
    if (options.extraParams?.sbomPath) {
      args.push('--sbom', options.extraParams.sbomPath as string);
    }
    if (options.extraParams?.directory) {
      args.push('--recursive', options.extraParams.directory as string);
    }

    try {
      await execFileAsync(this.binaryPath, args, { timeout: 300000 });
    } catch (err: any) {
      if (err.code !== 0 && err.code !== 1) {
        throw err;
      }
    }
  }

  private async runDocker(options: ScannerOptions): Promise<OSVScanResult> {
    const volumes: Array<{ host: string; container: string; mode?: string }> = [];
    const cmd: string[] = ['--format', 'json'];

    if (options.extraParams?.lockfilePath) {
      const lockPath = options.extraParams.lockfilePath as string;
      const lockDir = dirname(lockPath);
      const lockFile = basename(lockPath);
      volumes.push({ host: lockDir, container: '/src', mode: 'ro' });
      cmd.push('--lockfile', `/src/${lockFile}`);
    }
    if (options.extraParams?.sbomPath) {
      const sbomPath = options.extraParams.sbomPath as string;
      const sbomDir = dirname(sbomPath);
      const sbomFile = basename(sbomPath);
      volumes.push({ host: sbomDir, container: '/sbom', mode: 'ro' });
      cmd.push('--sbom', `/sbom/${sbomFile}`);
    }
    if (options.extraParams?.directory) {
      const dirPath = options.extraParams.directory as string;
      volumes.push({ host: dirPath, container: '/repo', mode: 'ro' });
      cmd.push('--recursive', '/repo');
    }

    const result = await runDocker({
      image: DOCKER_IMAGE,
      cmd,
      volumes,
      timeout: 600000,
      autoRemove: true,
    });

    if (result.exitCode !== 0 && result.exitCode !== 1) {
      throw new Error(`OSV-Scanner docker failed: ${result.stderr || result.stdout}`);
    }

    try {
      return JSON.parse(result.stdout.trim()) as OSVScanResult;
    } catch {
      return { results: [] };
    }
  }

  private parseResults(result: OSVScanResult): ScannerFinding[] {
    const findings: ScannerFinding[] = [];

    if (!result.results) return findings;

    for (const r of result.results) {
      if (!r.vulns || r.vulns.length === 0) continue;

      const pkgName = r.pkg?.name;
      const pkgVersion = r.pkg?.version;

      for (const vuln of r.vulns) {
        const severity = this.extractSeverity(vuln);
        const cve = vuln.aliases?.find(a => a.startsWith('CVE-')) || (vuln.id.startsWith('CVE-') ? vuln.id : undefined);

        findings.push({
          title: vuln.summary || `${vuln.id} in ${pkgName}`,
          severity,
          cve,
          description: vuln.details || vuln.summary,
          filePath: r.target || 'package.json',
          location: `${pkgName}@${pkgVersion}`,
          scannerRef: vuln.id,
        });
      }
    }

    return findings;
  }

  private extractSeverity(vuln: OSVVulnerability): Severity {

    if (vuln.severity && vuln.severity.length > 0) {
      const cvssScore = this.parseCvssScore(vuln.severity[0].score);
      if (cvssScore >= 9) return Severity.CRITICAL;
      if (cvssScore >= 7) return Severity.HIGH;
      if (cvssScore >= 4) return Severity.MEDIUM;
      if (cvssScore > 0) return Severity.LOW;
    }

    const dbSeverity = vuln.database_specific?.severity?.toUpperCase();
    if (dbSeverity === 'CRITICAL') return Severity.CRITICAL;
    if (dbSeverity === 'HIGH') return Severity.HIGH;
    if (dbSeverity === 'MEDIUM') return Severity.MEDIUM;
    if (dbSeverity === 'LOW') return Severity.LOW;

    return Severity.MEDIUM;
  }

  private parseCvssScore(score: string): number {
    try {
      const match = score.match(/CVSS:.*\/([\d.]+)$/);
      if (match) return parseFloat(match[1]);
      const num = parseFloat(score);
      return isNaN(num) ? 0 : num;
    } catch {
      return 0;
    }
  }

  async scanSbom(sbomContent: string): Promise<ScannerResult> {
    const tmpDir = await mkdtemp(join(tmpdir(), 'osv-sbom-'));
    const sbomFile = join(tmpDir, 'sbom.json');

    try {
      await writeFile(sbomFile, sbomContent);
      return this.scan({ extraParams: { sbomPath: sbomFile } });
    } finally {
      unlink(sbomFile).catch(() => {});
    }
  }
}

export const osvScanner = new OSVScanner();
