import { createHmac, timingSafeEqual } from 'node:crypto';

const DEFAULT_HEADER_SIMULATION = 'X-SecOps-Simulation';
const DEFAULT_HEADER_SIGN = 'X-SecOps-Sign';
const DEFAULT_HEADER_TIMESTAMP = 'X-SecOps-Timestamp';
const DEFAULT_HEADER_TRACE_ID = 'X-B3-TraceId';
const DEFAULT_TIME_WINDOW = 300;

export interface DyeHeaders extends Record<string, string | undefined> {
  'X-SecOps-Simulation': string;
  'X-SecOps-Sign': string;
  'X-SecOps-Timestamp': string;
  'X-B3-TraceId'?: string;
}

export interface DyeVerifyResult {
  valid: boolean;
  reason?: string;
  traceId?: string;
}

export interface TrafficDyeOptions {
  salt: string;
  timeWindowSeconds?: number;
  headerSimulation?: string;
  headerSign?: string;
  headerTimestamp?: string;
  headerTraceId?: string;
  ipWhitelist?: string[];
  shadowRedisPrefix?: string;
  shadowMqSuffix?: string;
}

export class TrafficDye {
  private salt: string;
  private timeWindow: number;
  private headerSimulation: string;
  private headerSign: string;
  private headerTimestamp: string;
  private headerTraceId: string;
  private ipWhitelist: Set<string>;
  public shadowRedisPrefix: string;
  public shadowMqSuffix: string;

  constructor(options: TrafficDyeOptions) {
    this.salt = options.salt;
    this.timeWindow = options.timeWindowSeconds ?? DEFAULT_TIME_WINDOW;
    this.headerSimulation = options.headerSimulation ?? DEFAULT_HEADER_SIMULATION;
    this.headerSign = options.headerSign ?? DEFAULT_HEADER_SIGN;
    this.headerTimestamp = options.headerTimestamp ?? DEFAULT_HEADER_TIMESTAMP;
    this.headerTraceId = options.headerTraceId ?? DEFAULT_HEADER_TRACE_ID;
    this.ipWhitelist = new Set(options.ipWhitelist ?? []);
    this.shadowRedisPrefix = options.shadowRedisPrefix ?? 'secops:';
    this.shadowMqSuffix = options.shadowMqSuffix ?? '-shadow';
  }

  generateHeaders(traceId?: string): DyeHeaders {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = this.sign(timestamp);
    const headers: Record<string, string> = {
      [this.headerSimulation]: 'True',
      [this.headerSign]: signature,
      [this.headerTimestamp]: timestamp,
    };
    if (traceId) {
      headers[this.headerTraceId] = traceId;
    }
    return headers as DyeHeaders;
  }

  verify(headers: Record<string, string | string[] | undefined>, clientIp?: string): DyeVerifyResult {
    const simulation = this.getHeader(headers, this.headerSimulation);
    if (!simulation || simulation !== 'True') {
      return { valid: false, reason: 'missing_simulation_header' };
    }

    const timestamp = this.getHeader(headers, this.headerTimestamp);
    if (!timestamp) {
      return { valid: false, reason: 'missing_timestamp' };
    }

    const ts = parseInt(timestamp, 10);
    if (isNaN(ts)) {
      return { valid: false, reason: 'invalid_timestamp' };
    }

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - ts) > this.timeWindow) {
      return { valid: false, reason: 'timestamp_expired' };
    }

    const sign = this.getHeader(headers, this.headerSign);
    if (!sign) {
      return { valid: false, reason: 'missing_signature' };
    }

    const expectedSign = this.sign(timestamp);
    const signBuf = Buffer.from(sign, 'hex');
    const expectedBuf = Buffer.from(expectedSign, 'hex');

    if (signBuf.length !== expectedBuf.length || !timingSafeEqual(signBuf, expectedBuf)) {
      return { valid: false, reason: 'signature_mismatch' };
    }

    if (this.ipWhitelist.size > 0 && clientIp && !this.ipWhitelist.has(clientIp)) {
      return { valid: false, reason: 'ip_not_whitelisted' };
    }

    const traceId = this.getHeader(headers, this.headerTraceId);
    return { valid: true, traceId };
  }

  getShadowRedisKey(originalKey: string): string {
    return `${this.shadowRedisPrefix}${originalKey}`;
  }

  getShadowMqQueue(originalQueue: string): string {
    return `${originalQueue}${this.shadowMqSuffix}`;
  }

  private sign(timestamp: string): string {
    return createHmac('sha256', this.salt).update(timestamp).digest('hex');
  }

  private getHeader(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
    const value = headers[name] ?? headers[name.toLowerCase()];
    if (Array.isArray(value)) return value[0];
    return value;
  }
}

export { createDyeMiddleware, createShadowRedis, createShadowMq } from './middleware.js';
export type {
  MockHandler,
  MockRouteConfig,
  DyeMiddlewareOptions,
} from './middleware.js';
