import { BaseScanner, ScannerResult, ScannerOptions, ScannerFinding } from './base.js';
import { config } from '../config.js';
import { TrafficDye } from '@secops/traffic-dye';
import { webcrypto as crypto } from 'node:crypto';

interface PlaywrightLoginConfig {
  loginUrl: string;
  username: string;
  password: string;
  usernameSelector?: string;
  passwordSelector?: string;
  submitSelector?: string;
  postLoginUrl?: string;
  postLoginWaitSelector?: string;
}

interface PlaywrightScanOptions extends ScannerOptions {
  loginConfig?: PlaywrightLoginConfig;
  crawlUrls?: string[];
  maxPages?: number;
  useZapProxy?: boolean;
  zapProxyUrl?: string;
  enableTrafficDye?: boolean;
  trafficDyeSalt?: string;
}

export class PlaywrightScanner extends BaseScanner {
  readonly name = 'Playwright';
  readonly scanType = 'DYNAMIC_PLAYWRIGHT';

  private get enabledFlag(): boolean {
    return config.PLAYWRIGHT_ENABLED === 'true';
  }

  get enabled(): boolean {
    return this.enabledFlag;
  }

  async scan(options: PlaywrightScanOptions): Promise<ScannerResult> {
    const startTime = Date.now();
    const targetUrl = options.targetUrl;

    if (!targetUrl) {
      return { success: false, findings: [], error: 'Target URL required' };
    }

    if (!this.enabled) {
      const { zapScanner } = await import('./zap.js');
      if (zapScanner.enabled) {
        return zapScanner.scan(options);
      }
      return { success: false, findings: [], error: 'No DAST scanner available' };
    }

    let playwright: any;
    try {
      const mod = await import('playwright');
      playwright = mod;
    } catch {
      const { zapScanner } = await import('./zap.js');
      if (zapScanner.enabled) {
        return zapScanner.scan(options);
      }
      return { success: false, findings: [], error: 'Playwright not installed. Run: npm i playwright' };
    }

    const loginConfig = options.loginConfig;
    const crawlUrls = options.crawlUrls || [targetUrl];
    const maxPages = options.maxPages || 20;
    const useZapProxy = options.useZapProxy !== false;
    const zapProxyUrl = options.zapProxyUrl || config.ZAP_PROXY_URL || 'http://localhost:8080';
    const enableTrafficDye = options.enableTrafficDye || config.TRAFFIC_DYE_ENABLED === 'true';

    const traceId = options.traceId || this.generateTraceId();

    const dye = enableTrafficDye && options.trafficDyeSalt
      ? new TrafficDye({ salt: options.trafficDyeSalt })
      : null;

    const browser = await playwright.chromium.launch({
      proxy: useZapProxy ? { server: zapProxyUrl } : undefined,
      headless: true,
    });

    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      userAgent: 'SecPilot/1.0 (Playwright Security Scanner)',
    });

    if (dye) {
      await context.setExtraHTTPHeaders({
        ...dye.generateHeaders(traceId),
        'traceparent': `00-${traceId}-${this.generateSpanId()}-01`,
      });
    } else {
      await context.setExtraHTTPHeaders({
        'X-B3-TraceId': traceId,
        'traceparent': `00-${traceId}-${this.generateSpanId()}-01`,
      });
    }

    const page = await context.newPage();

    try {
      if (loginConfig) {
        await this.performLogin(page, loginConfig);
      }

      const visited = new Set<string>();
      const toVisit = [...crawlUrls];
      let pageCount = 0;

      while (toVisit.length > 0 && pageCount < maxPages) {
        const url = toVisit.shift()!;
        if (visited.has(url)) continue;
        visited.add(url);
        pageCount++;

        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(1000);

          const links = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a[href]'))
              .map(a => (a as HTMLAnchorElement).href)
              .filter(href => href.startsWith(window.location.origin))
              .slice(0, 10);
          });

          for (const link of links) {
            if (!visited.has(link) && toVisit.length < 50) {
              toVisit.push(link);
            }
          }

          const forms = await page.evaluate(() => {
            return document.querySelectorAll('form').length;
          });

          if (forms > 0) {
            await this.fuzzForms(page, dye);
          }
        } catch {
          continue;
        }
      }

      let findings: ScannerFinding[] = [];

      if (useZapProxy) {
        try {
          const { zapScanner } = await import('./zap.js');
          if (zapScanner.enabled) {
            const alerts = await zapScanner.getAlerts(targetUrl);
            findings = (zapScanner as any).parseAlerts(alerts);
          }
        } catch {
        }
      }

      const durationSeconds = Math.floor((Date.now() - startTime) / 1000);

      return {
        success: true,
        findings,
        durationSeconds,
        traceId,
        rawResponse: { pagesScanned: pageCount, uniqueUrls: visited.size, usedZap: useZapProxy, traceId },
      };
    } catch (error) {
      return {
        success: false,
        findings: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
      await browser.close().catch(() => {});
    }
  }

  private generateTraceId(): string {
    return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('hex');
  }

  private generateSpanId(): string {
    return Buffer.from(crypto.getRandomValues(new Uint8Array(8))).toString('hex');
  }

  private async performLogin(page: any, config: PlaywrightLoginConfig): Promise<void> {
    const usernameSel = config.usernameSelector || 'input[type="email"], input[name="username"], input[name="email"]';
    const passwordSel = config.passwordSelector || 'input[type="password"], input[name="password"]';
    const submitSel = config.submitSelector || 'button[type="submit"], button:has-text("登录"), button:has-text("Login")';

    await page.goto(config.loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1000);

    const usernameInput = await page.$(usernameSel);
    const passwordInput = await page.$(passwordSel);

    if (usernameInput && passwordInput) {
      await usernameInput.fill(config.username);
      await passwordInput.fill(config.password);

      const submitBtn = await page.$(submitSel);
      if (submitBtn) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}),
          submitBtn.click(),
        ]);
      } else {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}),
          page.keyboard.press('Enter'),
        ]);
      }

      if (config.postLoginWaitSelector) {
        await page.waitForSelector(config.postLoginWaitSelector, { timeout: 15000 }).catch(() => {});
      } else {
        await page.waitForTimeout(2000);
      }
    }
  }

  private async fuzzForms(page: any, dye: TrafficDye | null): Promise<void> {
    const inputs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input, textarea, select'))
        .filter(el => el.type !== 'hidden' && el.type !== 'submit')
        .map((el: any) => ({ name: el.name, id: el.id, type: el.type }));
    });

    if (inputs.length === 0) return;

    const fuzzPayloads = [
      '<script>alert(1)</script>',
      '"><svg onload=alert(1)>',
      "' OR '1'='1",
      '../../etc/passwd',
      '${7*7}',
    ];

    for (const input of inputs.slice(0, 3)) {
      for (const payload of fuzzPayloads.slice(0, 2)) {
        try {
          const selector = input.name ? `[name="${input.name}"]` : input.id ? `#${input.id}` : null;
          if (!selector) continue;
          await page.fill(selector, payload).catch(() => {});
        } catch {
          continue;
        }
      }
    }
  }
}

export const playwrightScanner = new PlaywrightScanner();
