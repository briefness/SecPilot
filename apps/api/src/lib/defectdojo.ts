import { config } from '../config.js';

interface DefectDojoConfig {
  url: string;
  apiKey?: string;
  username?: string;
  password?: string;
}

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface DDProduct {
  id: number;
  name: string;
  description?: string;
  prod_type?: number;
  sla_configuration?: number;
  tags?: string[];
  created: string;
  updated?: string;
}

export interface DDEngagement {
  id: number;
  name: string;
  description?: string;
  product: number;
  engagement_type?: string;
  status?: string;
  target_start?: string;
  target_end?: string;
  created?: string;
  updated?: string;
}

export interface DDTest {
  id: number;
  title?: string;
  description?: string;
  test_type?: string;
  engagement: number;
  scan_date?: string;
  percent_complete?: number;
  created?: string;
  updated?: string;
}

export interface DDFinding {
  id: number;
  title: string;
  description?: string;
  severity: string;
  cwe?: number | null;
  cve?: string | null;
  cvssv3?: string | null;
  cvssv3_score?: number | null;
  file_path?: string | null;
  line?: number | null;
  url?: string | null;
  false_p?: boolean;
  duplicate?: boolean;
  duplicate_finding?: number | null;
  active?: boolean;
  verified?: boolean;
  numerical_severity?: string;
  test: number;
  product: number;
  engagement: number;
  source_code_file?: string | null;
  source_code_line_number?: number | null;
  component_name?: string | null;
  component_version?: string | null;
  static_finding?: boolean;
  dynamic_finding?: boolean;
  created?: string;
  updated?: string;
  last_status_update?: string;
}

export interface DDCreateProductPayload {
  name: string;
  description?: string;
  prod_type?: number;
  sla_configuration?: number;
  tags?: string[];
}

export interface DDCreateEngagementPayload {
  name: string;
  product: number;
  description?: string;
  engagement_type?: string;
  status?: string;
  target_start?: string;
  target_end?: string;
}

export interface DDCreateTestPayload {
  title?: string;
  description?: string;
  test_type: string;
  engagement: number;
  scan_date?: string;
  environment?: string;
}

export interface DDCreateFindingPayload {
  title: string;
  description: string;
  severity: string;
  cwe?: number;
  cve?: string;
  cvssv3_score?: number;
  file_path?: string;
  line?: number;
  url?: string;
  false_p?: boolean;
  active?: boolean;
  verified?: boolean;
  test: number;
  source_code_file?: string;
  source_code_line_number?: number;
  component_name?: string;
  component_version?: string;
  static_finding?: boolean;
  dynamic_finding?: boolean;
}

export interface DDFindingListParams {
  product?: number;
  engagement?: number;
  test?: number;
  severity?: string;
  cwe?: number;
  cve?: string;
  false_p?: boolean;
  active?: boolean;
  duplicate?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
  ordering?: string;
}

export interface DDProductListParams {
  name?: string;
  search?: string;
  limit?: number;
  offset?: number;
  ordering?: string;
}

class DefectDojoClient {
  private config: DefectDojoConfig;
  private apiKey: string | null = null;

  constructor(cfg?: Partial<DefectDojoConfig>) {
    this.config = {
      url: cfg?.url || config.DEFECTDOJO_URL || 'http://localhost:8081',
      apiKey: cfg?.apiKey || config.DEFECTDOJO_API_KEY,
      username: cfg?.username || config.DEFECTDOJO_USERNAME,
      password: cfg?.password || config.DEFECTDOJO_PASSWORD,
    };
    this.apiKey = this.config.apiKey || null;
  }

  get enabled(): boolean {
    return !!this.config.url && !!this.apiKey;
  }

  private get baseUrl(): string {
    return this.config.url.replace(/\/$/, '');
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    data?: unknown,
    params?: Record<string, unknown>
  ): Promise<T> {
    if (!this.apiKey) {
      throw new Error('DefectDojo API key not configured');
    }

    let url = `${this.baseUrl}/api/v2${path}`;

    if (params) {
      const usp = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) usp.append(k, String(v));
      }
      const qs = usp.toString();
      if (qs) url += `?${qs}`;
    }

    const headers: Record<string, string> = {
      'Authorization': `Token ${this.apiKey}`,
      'Accept': 'application/json',
    };

    let body: string | undefined;
    if (data && method !== 'GET') {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(data);
    }

    try {
      const res = await fetch(url, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(30000),
      });

      const text = await res.text();
      let json: unknown;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = text;
      }

      if (!res.ok) {
        console.error(`DefectDojo API error ${method} ${path}:`, res.status, JSON.stringify(json));
        throw new Error(`DefectDojo API error ${res.status}`);
      }

      return json as T;
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        console.error(`DefectDojo API timeout ${method} ${path}`);
      }
      throw err;
    }
  }

  async login(): Promise<string> {
    if (!this.config.username || !this.config.password) {
      throw new Error('DefectDojo username/password not configured');
    }

    const res = await fetch(`${this.baseUrl}/api/v2/api-token-auth/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: this.config.username,
        password: this.config.password,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      throw new Error(`DefectDojo login failed: ${res.status}`);
    }

    const data = (await res.json()) as { token: string };
    this.apiKey = data.token;
    return data.token;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.request('GET', '/');
      return true;
    } catch {
      return false;
    }
  }

  async listProducts(params: DDProductListParams = {}): Promise<PaginatedResponse<DDProduct>> {
    const query: Record<string, unknown> = {};
    if (params.name) query.name = params.name;
    if (params.search) query.search = params.search;
    if (params.limit) query.limit = params.limit;
    if (params.offset) query.offset = params.offset;
    if (params.ordering) query.ordering = params.ordering;
    return this.request<PaginatedResponse<DDProduct>>('GET', '/products/', undefined, query);
  }

  async getProduct(id: number): Promise<DDProduct> {
    return this.request<DDProduct>('GET', `/products/${id}/`);
  }

  async createProduct(payload: DDCreateProductPayload): Promise<DDProduct> {
    return this.request<DDProduct>('POST', '/products/', payload);
  }

  async updateProduct(id: number, payload: Partial<DDCreateProductPayload>): Promise<DDProduct> {
    return this.request<DDProduct>('PATCH', `/products/${id}/`, payload);
  }

  async deleteProduct(id: number): Promise<void> {
    return this.request('DELETE', `/products/${id}/`);
  }

  async listEngagements(productId?: number): Promise<PaginatedResponse<DDEngagement>> {
    const params: Record<string, unknown> = {};
    if (productId) params.product = productId;
    return this.request<PaginatedResponse<DDEngagement>>('GET', '/engagements/', undefined, params);
  }

  async getEngagement(id: number): Promise<DDEngagement> {
    return this.request<DDEngagement>('GET', `/engagements/${id}/`);
  }

  async createEngagement(payload: DDCreateEngagementPayload): Promise<DDEngagement> {
    return this.request<DDEngagement>('POST', '/engagements/', payload);
  }

  async listTests(engagementId?: number): Promise<PaginatedResponse<DDTest>> {
    const params: Record<string, unknown> = {};
    if (engagementId) params.engagement = engagementId;
    return this.request<PaginatedResponse<DDTest>>('GET', '/tests/', undefined, params);
  }

  async getTest(id: number): Promise<DDTest> {
    return this.request<DDTest>('GET', `/tests/${id}/`);
  }

  async createTest(payload: DDCreateTestPayload): Promise<DDTest> {
    return this.request<DDTest>('POST', '/tests/', payload);
  }

  async listFindings(params: DDFindingListParams = {}): Promise<PaginatedResponse<DDFinding>> {
    const query: Record<string, unknown> = {};
    if (params.product) query.product = params.product;
    if (params.engagement) query.engagement = params.engagement;
    if (params.test) params.test = params.test;
    if (params.severity) query.severity = params.severity;
    if (params.cwe) query.cwe = params.cwe;
    if (params.cve) query.cve = params.cve;
    if (params.false_p !== undefined) query.false_p = params.false_p;
    if (params.active !== undefined) query.active = params.active;
    if (params.duplicate !== undefined) query.duplicate = params.duplicate;
    if (params.search) query.search = params.search;
    if (params.limit) query.limit = params.limit;
    if (params.offset) query.offset = params.offset;
    if (params.ordering) query.ordering = params.ordering;
    return this.request<PaginatedResponse<DDFinding>>('GET', '/findings/', undefined, query);
  }

  async getFinding(id: number): Promise<DDFinding> {
    return this.request<DDFinding>('GET', `/findings/${id}/`);
  }

  async createFinding(payload: DDCreateFindingPayload): Promise<DDFinding> {
    return this.request<DDFinding>('POST', '/findings/', payload);
  }

  async updateFinding(id: number, payload: Partial<DDCreateFindingPayload>): Promise<DDFinding> {
    return this.request<DDFinding>('PATCH', `/findings/${id}/`, payload);
  }

  async markFalsePositive(id: number, isFalsePositive: boolean): Promise<DDFinding> {
    return this.request<DDFinding>('PATCH', `/findings/${id}/`, {
      false_p: isFalsePositive,
      active: !isFalsePositive,
    });
  }

  async getProductFindingSummary(productId: number): Promise<Record<string, number>> {
    const severities = ['Critical', 'High', 'Medium', 'Low', 'Info'];
    const result: Record<string, number> = {};

    await Promise.all(
      severities.map(async (sev) => {
        try {
          const data = await this.request<PaginatedResponse<DDFinding>>(
            'GET',
            '/findings/',
            undefined,
            { product: productId, severity: sev, active: true, false_p: false, limit: 1 }
          );
          result[sev.toLowerCase()] = data.count;
        } catch {
          result[sev.toLowerCase()] = 0;
        }
      })
    );

    return result;
  }

  async importScanResult(
    engagementId: number,
    scanType: string,
    findings: Array<{
      title: string;
      description: string;
      severity: string;
      cwe?: number;
      cve?: string;
      cvssv3_score?: number;
      file_path?: string;
      line?: number;
      url?: string;
      false_p?: boolean;
    }>
  ): Promise<{ created: number; testId: number }> {
    const today = new Date().toISOString().split('T')[0];

    const testTypeMap: Record<string, string> = {
      STATIC_SAST: 'SonarQube Scan',
      STATIC_SCA: 'Dependency Check Scan',
      DYNAMIC_DAST: 'ZAP Scan',
      DYNAMIC_PLAYWRIGHT: 'Playwright Scan',
      MOBILE_MOBSF: 'MobSF Scan',
      API_NUCLEI: 'Nuclei Scan',
    };

    const testType = testTypeMap[scanType] || 'Generic Scan';

    const test = await this.createTest({
      test_type: testType,
      engagement: engagementId,
      title: `${testType} - ${today}`,
      scan_date: today,
      environment: 'Production',
    });

    let created = 0;
    for (const finding of findings) {
      try {
        await this.createFinding({
          title: finding.title,
          description: finding.description,
          severity: finding.severity.charAt(0).toUpperCase() + finding.severity.slice(1).toLowerCase(),
          cwe: finding.cwe,
          cve: finding.cve,
          cvssv3_score: finding.cvssv3_score,
          file_path: finding.file_path,
          line: finding.line,
          url: finding.url,
          false_p: finding.false_p,
          active: true,
          verified: false,
          test: test.id,
        });
        created++;
      } catch (err) {
        console.error(`Failed to create DefectDojo finding: ${finding.title}`, err);
      }
    }

    return { created, testId: test.id };
  }

  async getOrCreateEngagement(productId: number, name: string): Promise<DDEngagement> {
    const engagements = await this.listEngagements(productId);
    const existing = engagements.results.find((e) => e.name === name);

    if (existing) return existing;

    const today = new Date().toISOString().split('T')[0];
    const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    return this.createEngagement({
      name,
      product: productId,
      engagement_type: 'CI/CD',
      status: 'In Progress',
      target_start: today,
      target_end: endDate,
    });
  }

  async listFindings(
    productId: number,
    params?: {
      active?: string;
      verified?: string;
      severity?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<DDFinding[]> {
    const result = await this.request<PaginatedResponse<DDFinding>>(
      'GET',
      '/findings/',
      undefined,
      {
        product: productId,
        ...params,
      }
    );
    return result.results;
  }
}

let clientInstance: DefectDojoClient | null = null;

export function getDefectDojoClient(): DefectDojoClient {
  if (!clientInstance) {
    clientInstance = new DefectDojoClient();
  }
  return clientInstance;
}

export default DefectDojoClient;
