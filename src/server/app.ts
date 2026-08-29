import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getCookie } from 'hono/cookie';
import type { PrismaClient } from '@prisma/client';
import type { AppEnv } from './env.ts';
import { handleError, HttpError } from './http/errors.ts';
import { authRoutes, validateCsrfToken } from './routes/auth.ts';
import { ACCESS_TOKEN_COOKIE_NAME, CSRF_TOKEN_COOKIE_NAME, REFRESH_TOKEN_COOKIE_NAME } from './config.ts';
import { grievanceRoutes } from './routes/grievances.ts';
import { attachmentRoutes } from './routes/attachments.ts';
import { adminRoutes } from './routes/admin.ts';
import { rateLimiter } from './http/rate_limit.ts';
import { bodyLimit } from 'hono/body-limit';
import { MAX_ATTACHMENT_BYTES } from './config.ts';
import { prometheusMiddleware, register } from './metrics.ts';

export type CreateAppOptions = {
    db: PrismaClient;
    uploadsDir: string;
    allowedOrigins?: string[];
};

export function createApp(options: CreateAppOptions) {
    const app = new Hono<AppEnv>();

    // Track Prometheus Metrics
    app.use('*', prometheusMiddleware);


    app.use('*', async (c, next) => {
        c.set('db', options.db);
        c.set('uploadsDir', options.uploadsDir);

        // Secure HTTP Headers
        c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none';");
        c.header('X-Content-Type-Options', 'nosniff');
        c.header('X-Frame-Options', 'DENY');
        c.header('Referrer-Policy', 'no-referrer');
        c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
        if (process.env.NODE_ENV === 'production') {
            c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }

        await next();
    });

    app.use('/api/*', async (c, next) => {
        const method = c.req.method.toUpperCase();
        const isUnsafe = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
        const hasAuthHeader = !!c.req.header('Authorization');
        const publicMutations = new Set(['/api/csrf', '/api/login', '/api/signup', '/api/refresh']);
        const hasAuthCookies = !!(
            getCookie(c, ACCESS_TOKEN_COOKIE_NAME) || getCookie(c, REFRESH_TOKEN_COOKIE_NAME)
        );

        if (isUnsafe && !hasAuthHeader && !publicMutations.has(c.req.path) && hasAuthCookies) {
            const csrfCookie = getCookie(c, CSRF_TOKEN_COOKIE_NAME);
            const csrfHeader = c.req.header('x-csrf-token');
            if (!csrfCookie || !csrfHeader || !validateCsrfToken(c, csrfCookie)) {
                return c.json({ error: 'CSRF token missing or invalid.', code: 'forbidden' }, 403);
            }
        }
        await next();
    });


    const configuredOrigins = process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
        : null;

    const allowedOrigins = new Set(
        options.allowedOrigins ?? configuredOrigins ?? [
            'http://localhost:3000',
            'http://localhost:5173',
        ]
    );


    app.use(
        '/api/*',
        cors({
            origin: (origin) => (allowedOrigins.has(origin) ? origin : null),
            credentials: true,
            allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
            allowHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
            maxAge: 600,
        })
    );


    app.onError((err, c) => handleError(err, c));

    // Health check endpoint for Docker / LB probes
    app.get('/api/health', async (c) => {
        try {
            await options.db.$queryRaw`SELECT 1`;
            return c.json({
                status: 'healthy',
                database: 'connected',
                timestamp: new Date().toISOString()
            });
        } catch (err: any) {
            return c.json(
                {
                    status: 'unhealthy',
                    database: 'disconnected',
                    error: err.message ?? 'DB ping failed',
                    timestamp: new Date().toISOString()
                },
                503
            );
        }
    });

    // Prometheus Metrics endpoint for Grafana/Prometheus scraping
    app.get('/api/metrics', async () => {
        const metrics = await register.metrics();
        return new Response(metrics, {
            status: 200,
            headers: {
                'Content-Type': register.contentType
            }
        });
    });

    app.notFound((c) => c.json({ error: 'Not found.', code: 'not_found' }, 404));

    app.route('/api', authRoutes);
    app.route('/api/admin', adminRoutes);

    app.use(
        '/api/grievances/*',
        bodyLimit({
            maxSize: MAX_ATTACHMENT_BYTES,
            onError: (c) => {
                return c.json({ error: 'Payload too large. Attachment must be 2 MB or smaller.', code: 'bad_request' }, 400);
            }
        })
    );

    app.route('/api/grievances', grievanceRoutes);
    app.route('/api/attachments', attachmentRoutes);

    if (process.env.NODE_ENV !== 'production') {
        app.get(
            '/api/public-test',
            rateLimiter({ maxTokens: 5, refillRate: 1.0, mode: 'ip' }),
            (c) => c.json({ message: 'Hello from the public rate-limited endpoint!' })
        );
    }


    app.all('/api/*', () => {
        throw new HttpError(404, 'not_found', 'Not found.');
    });

    return app;
}