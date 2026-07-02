import { createHash } from 'node:crypto';

export interface DedupInput {
  cwe?: string;
  filePath?: string;
  lineStart?: number;
  location?: string;
  title?: string;
  params?: Record<string, string>;
}

export function computeDedupHash(input: DedupInput): string {
  const normalized = {
    cwe: (input.cwe || '').toUpperCase().trim(),
    filePath: (input.filePath || '').trim(),
    lineStart: input.lineStart || 0,
    location: (input.location || '').trim(),
    title: (input.title || '').toLowerCase().trim(),
    params: input.params ? sortAndNormalizeParams(input.params) : '',
  };

  const components = [
    normalized.cwe,
    normalized.filePath,
    normalized.lineStart.toString(),
    normalized.location,
    normalized.params,
  ].filter(Boolean);

  const key = components.join(':');
  return createHash('md5').update(key).digest('hex');
}

function sortAndNormalizeParams(params: Record<string, string>): string {
  const sorted = Object.keys(params)
    .sort()
    .map((key) => `${key.toLowerCase()}=${params[key]}`)
    .join('&');
  return sorted;
}

export function computeSastDedupHash(cwe: string, filePath: string, lineStart: number): string {
  return computeDedupHash({ cwe, filePath, lineStart });
}

export function computeDynamicDedupHash(cwe: string, location: string, params?: Record<string, string>): string {
  return computeDedupHash({ cwe, location, params });
}

export function computeScaDedupHash(cve: string, packageName: string, version: string): string {
  return computeDedupHash({
    cwe: cve,
    filePath: packageName,
    title: version,
  });
}
