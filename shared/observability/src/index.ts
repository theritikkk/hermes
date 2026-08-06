export interface LogContext {
  service: string;
  correlationId?: string;
  executionId?: string;
  tenantId?: string;
  userId?: string;
  traceId?: string;
}

export interface Logger {
  info(message: string, extra?: Record<string, unknown>): void;
  warn(message: string, extra?: Record<string, unknown>): void;
  error(message: string, error?: unknown, extra?: Record<string, unknown>): void;
  critical(message: string, extra?: Record<string, unknown>): void;
}

export function createLogger(ctx: LogContext): Logger {
  const write = (level: string, message: string, extra: Record<string, unknown> = {}) => {
    const traceId = process.env._X_AMZN_TRACE_ID ?? ctx.traceId;
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      service: ctx.service,
      traceId,
      correlationId: ctx.correlationId,
      executionId: ctx.executionId,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      message,
      ...extra,
    }));
  };

  return {
    info: (msg, extra) => write('INFO', msg, extra),
    warn: (msg, extra) => write('WARN', msg, extra),
    error: (msg, err, extra) => write('ERROR', msg, {
      error: err instanceof Error ? { message: err.message, stack: err.stack } : String(err),
      ...extra,
    }),
    critical: (msg, extra) => write('CRITICAL', msg, extra),
  };
}

// Backward compatibility
export function log(level: 'info' | 'warn' | 'error', message: string, ctx: LogContext, extra?: Record<string, unknown>): void {
  const logger = createLogger(ctx);
  if (level === 'info') logger.info(message, extra);
  else if (level === 'warn') logger.warn(message, extra);
  else if (level === 'error') logger.error(message, undefined, extra);
}

export function logInfo(message: string, ctx: LogContext, extra?: Record<string, unknown>): void {
  createLogger(ctx).info(message, extra);
}

export function logError(message: string, ctx: LogContext, extra?: Record<string, unknown>): void {
  createLogger(ctx).error(message, undefined, extra);
}
