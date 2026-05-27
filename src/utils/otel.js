import { trace, context, SpanStatusCode, propagation } from '@opentelemetry/api';

const tracer = trace.getTracer('otto', '0.1.0');

export { tracer, SpanStatusCode, context, propagation };

/**
 * Run fn inside a new child span. Never throws — if OTel is not configured
 * (the default) this is a zero-overhead no-op.
 */
export async function withSpan(name, attributes, fn) {
  return tracer.startActiveSpan(name, async (span) => {
    if (attributes) {
      for (const [k, v] of Object.entries(attributes)) {
        span.setAttribute(k, v);
      }
    }
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      span.recordException(err);
      throw err;
    } finally {
      span.end();
    }
  });
}
