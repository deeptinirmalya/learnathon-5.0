import client from 'prom-client';
import type { Context, Next } from 'hono';

// Create a Registry which registers the metrics
export const register = new client.Registry();

// Add a default label which is added to all metrics
register.setDefaultLabels({
	app: 'hostel-grievance'
});

// Enable the collection of default Node.js runtime metrics (CPU, Memory, Event Loop, GC)
client.collectDefaultMetrics({ register });

// Custom HTTP Metrics
export const httpRequestDurationMicroseconds = new client.Histogram({
	name: 'http_request_duration_seconds',
	help: 'Duration of HTTP requests in seconds',
	labelNames: ['method', 'route', 'status_code'],
	buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
});
register.registerMetric(httpRequestDurationMicroseconds);

export const httpRequestsTotal = new client.Counter({
	name: 'http_requests_total',
	help: 'Total number of HTTP requests processed',
	labelNames: ['method', 'route', 'status_code']
});
register.registerMetric(httpRequestsTotal);

/**
 * Middleware that tracks request rate, status code, and latency
 */
export async function prometheusMiddleware(c: Context, next: Next) {
	if (c.req.path === '/api/metrics') {
		return await next();
	}

	const end = httpRequestDurationMicroseconds.startTimer();
	const method = c.req.method;

	await next();

	const status = c.res.status.toString();
	// Normalize route to avoid high cardinality
	const route = c.req.path.replace(/\/GRV-\d+/g, '/:id').replace(/\/att-[a-zA-Z0-9_-]+/g, '/:id');

	end({ method, route, status_code: status });
	httpRequestsTotal.inc({ method, route, status_code: status });
}
