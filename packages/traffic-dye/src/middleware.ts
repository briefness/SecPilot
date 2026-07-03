import { TrafficDye, DyeVerifyResult } from './index.js';

export interface MockHandler {
  (req: any, res: any, dyeResult: DyeVerifyResult): void | Promise<void>;
}

export interface MockRouteConfig {
  method?: string;
  path: string | RegExp;
  handler: MockHandler;
  statusCode?: number;
  responseBody?: unknown;
}

export interface DyeMiddlewareOptions {
  salt: string;
  timeWindowSeconds?: number;
  ipWhitelist?: string[];
  shadowRedisPrefix?: string;
  shadowMqSuffix?: string;
  mockRoutes?: MockRouteConfig[];
  defaultMockResponse?: {
    statusCode: number;
    body: unknown;
  };
  onVerified?: (req: any, dyeResult: DyeVerifyResult) => void;
}

export function createDyeMiddleware(options: DyeMiddlewareOptions) {
  const dye = new TrafficDye({
    salt: options.salt,
    timeWindowSeconds: options.timeWindowSeconds,
    ipWhitelist: options.ipWhitelist,
    shadowRedisPrefix: options.shadowRedisPrefix,
    shadowMqSuffix: options.shadowMqSuffix,
  });

  const mockRoutes = options.mockRoutes || [];

  function matchRoute(req: { method: string; url: string }): MockRouteConfig | undefined {
    for (const route of mockRoutes) {
      if (route.method && route.method.toUpperCase() !== req.method.toUpperCase()) {
        continue;
      }

      if (typeof route.path === 'string') {
        if (req.url.startsWith(route.path)) {
          return route;
        }
      } else if (route.path instanceof RegExp) {
        if (route.path.test(req.url)) {
          return route;
        }
      }
    }
    return undefined;
  }

  function expressMiddleware(req: any, res: any, next: (err?: any) => void) {
    const clientIp = req.ip || req.socket?.remoteAddress;
    const result = dye.verify(req.headers, clientIp);

    if (!result.valid) {
      return next();
    }

    (req as any).dye = result;
    (req as any).isSimulated = true;
    (req as any).traceId = result.traceId;

    if (options.onVerified) {
      options.onVerified(req, result);
    }

    const matchedRoute = matchRoute(req);
    if (matchedRoute) {
      if (matchedRoute.handler) {
        return Promise.resolve(matchedRoute.handler(req, res, result)).catch(next);
      }
      const statusCode = matchedRoute.statusCode || 200;
      const body = matchedRoute.responseBody !== undefined
        ? matchedRoute.responseBody
        : { status: 'ok', simulated: true, traceId: result.traceId };
      res.status(statusCode).json(body);
      return;
    }

    if (options.defaultMockResponse) {
      res.status(options.defaultMockResponse.statusCode).json(options.defaultMockResponse.body);
      return;
    }

    next();
  }

  function fastifyPlugin(fastify: any, _opts: any, done: (err?: any) => void) {
    fastify.addHook('onRequest', async (request: any, reply: any) => {
      const clientIp = request.ip || request.headers['x-forwarded-for'] || request.socket?.remoteAddress;
      const result = dye.verify(request.headers, clientIp);

      if (!result.valid) {
        return;
      }

      request.dye = result;
      request.isSimulated = true;
      request.traceId = result.traceId;

      if (options.onVerified) {
        options.onVerified(request, result);
      }

      const matchedRoute = matchRoute({
        method: request.method,
        url: request.url,
      });

      if (matchedRoute) {
        if (matchedRoute.handler) {
          await matchedRoute.handler(request, reply, result);
          return reply;
        }
        const statusCode = matchedRoute.statusCode || 200;
        const body = matchedRoute.responseBody !== undefined
          ? matchedRoute.responseBody
          : { status: 'ok', simulated: true, traceId: result.traceId };
        reply.code(statusCode).send(body);
        return reply;
      }
    });

    done();
  }

  return {
    dye,
    express: expressMiddleware,
    fastify: fastifyPlugin,
    fastifyPlugin: (fastify: any, opts: any, done: (err?: any) => void) => fastifyPlugin(fastify, opts, done),
    getShadowRedisKey: (key: string) => dye.getShadowRedisKey(key),
    getShadowMqQueue: (queue: string) => dye.getShadowMqQueue(queue),
  };
}

export function createShadowRedis(redis: any, prefix: string = 'secops:') {
  function shadowKey(key: string): string {
    if (key.startsWith(prefix)) return key;
    return `${prefix}${key}`;
  }

  return new Proxy(redis, {
    get(target: any, prop: string | symbol) {
      const fn = target[prop];
      if (typeof fn !== 'function') return fn;

      return function (...args: any[]) {
        if (typeof args[0] === 'string') {
          args[0] = shadowKey(args[0]);
        }
        return fn.apply(target, args);
      };
    },
  });
}

export function createShadowMq(
  producer: any,
  suffix: string = '-shadow',
  sendMethodName: string = 'send'
) {
  const originalSend = producer[sendMethodName]?.bind(producer);

  return new Proxy(producer, {
    get(target: any, prop: string | symbol) {
      const fn = target[prop];
      if (typeof fn !== 'function' || String(prop) !== sendMethodName) return fn;

      return function (topicOrQueue: string, ...args: any[]) {
        const shadowTopic = `${topicOrQueue}${suffix}`;
        return originalSend(shadowTopic, ...args);
      };
    },
  });
}
