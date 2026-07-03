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
    normalized.location,
    normalized.params,
  ];

  if (normalized.lineStart > 0) {
    components.splice(2, 0, normalized.lineStart.toString());
  }

  const key = components.filter(Boolean).join(':');
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

export interface Dedupable {
  id: string;
  dedupHash: string;
  createdAt: Date;
}

export interface FindingLike extends Dedupable {
  severity: string;
  falsePositive?: boolean;
  projectId?: string;
}

export function dedupeLatest<T extends Dedupable>(findings: T[]): T[] {
  const latestMap = new Map<string, T>();
  const sorted = [...findings].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  for (const f of sorted) {
    if (!latestMap.has(f.dedupHash)) {
      latestMap.set(f.dedupHash, f);
    }
  }
  return Array.from(latestMap.values());
}

export interface SeverityCounts {
  CRITICAL: number;
  HIGH: number;
  MEDIUM: number;
  LOW: number;
  INFO: number;
}

export function countBySeverity<T extends FindingLike>(
  findings: T[],
  excludeFalsePositive = true
): SeverityCounts {
  const counts: SeverityCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
  for (const f of findings) {
    if (excludeFalsePositive && f.falsePositive) continue;
    const sev = f.severity as keyof SeverityCounts;
    if (sev in counts) counts[sev]++;
  }
  return counts;
}

export function groupByProject<T extends FindingLike>(findings: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const f of findings) {
    if (!f.projectId) continue;
    if (!map.has(f.projectId)) map.set(f.projectId, []);
    map.get(f.projectId)!.push(f);
  }
  return map;
}
