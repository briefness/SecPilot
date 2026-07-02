import { ScanType } from '@prisma/client';
import { sonarQubeScanner } from './sonarqube.js';
import { osvScanner } from './osv-scanner.js';
import { zapScanner } from './zap.js';
import { mobsfScanner } from './mobsf.js';
import { nucleiScanner } from './nuclei.js';
import { playwrightScanner } from './playwright.js';
import type { BaseScanner, ScannerResult, ScannerOptions } from './base.js';

const scannerRegistry: Record<string, BaseScanner> = {
  [ScanType.STATIC_SAST]: sonarQubeScanner,
  [ScanType.STATIC_SCA]: osvScanner,
  [ScanType.DYNAMIC_H5]: playwrightScanner,
  [ScanType.MOBILE_MOBSF]: mobsfScanner,
  [ScanType.API_NUCLEI]: nucleiScanner,
};

export function getScanner(type: string): BaseScanner | undefined {
  return scannerRegistry[type];
}

export async function runScanner(
  type: string,
  options: ScannerOptions
): Promise<ScannerResult> {
  const scanner = getScanner(type);
  if (!scanner) {
    return {
      success: false,
      findings: [],
      error: `Unknown scanner type: ${type}`,
    };
  }
  return scanner.scan(options);
}

export { sonarQubeScanner, osvScanner, zapScanner, mobsfScanner, nucleiScanner, playwrightScanner };
export * from './base.js';
