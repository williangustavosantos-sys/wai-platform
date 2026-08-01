export interface LogContext {
  correlationId?: string;
  organizationId?: string;
  userId?: string;
  [key: string]: unknown;
}

/**
 * Strips sensitive keys (tokens, passwords, secret keys, credit cards) from log payloads
 * to prevent accidental data disclosure per Phase 0 engineering constraints.
 */
function sanitizePayload(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(sanitizePayload);
  }

  const sanitized: Record<string, unknown> = {};
  const sensitiveKeys = ['password', 'token', 'secret', 'key', 'service_role', 'authorization', 'cookie', 'session'];

  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const isSensitive = sensitiveKeys.some(sKey => key.toLowerCase().includes(sKey));
    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizePayload(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Structured JSON Logger for WAI Platform.
 * Enforces inclusion of correlationId and sanitizes all payloads.
 */
export class Logger {
  private baseContext: LogContext;

  constructor(context: LogContext = {}) {
    this.baseContext = {
      correlationId: context.correlationId || 'no-correlation-id',
      ...context,
    };
  }

  public child(extraContext: LogContext): Logger {
    return new Logger({
      ...this.baseContext,
      ...extraContext,
    });
  }

  private formatMessage(level: string, message: string, meta?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();
    const payload = {
      timestamp,
      level,
      message,
      ...this.baseContext,
      ...(meta ? sanitizePayload(meta) as Record<string, unknown> : {}),
    };
    return JSON.stringify(payload);
  }

  public info(message: string, meta?: Record<string, unknown>): void {
    console.info(this.formatMessage('INFO', message, meta));
  }

  public warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(this.formatMessage('WARN', message, meta));
  }

  public error(message: string, meta?: Record<string, unknown>, error?: unknown): void {
    const errorDetails = error instanceof Error
      ? { errorMessage: error.message, stack: error.stack }
      : { rawError: error };
    console.error(this.formatMessage('ERROR', message, { ...meta, ...errorDetails }));
  }

  public debug(message: string, meta?: Record<string, unknown>): void {
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true') {
      console.debug(this.formatMessage('DEBUG', message, meta));
    }
  }
}

export const logger = new Logger();
