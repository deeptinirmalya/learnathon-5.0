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

export type CreateAppOptions = {
    db: PrismaClient;
    uploadsDir: string;
    allowedOrigins?: string[];
};

export function createApp(options: CreateAppOptions) {
    const app = new Hono<AppEnv>();


    app.use('*', async (c, next) => {
        c.set('db', options.db);
        c.set('uploadsDir', options.uploadsDir);

        // Secure HTTP Headers including Content-Security-Policy
        c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; sandbox;");
        c.header('X-Content-Type-Options', 'nosniff');
        c.header('X-Frame-Options', 'DENY');
        c.header('Referrer-Policy', 'no-referrer');

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


    const allowedOrigins = new Set(
        options.allowedOrigins ?? [
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

    app.get(
        '/api/public-test',
        rateLimiter({ maxTokens: 5, refillRate: 1.0, mode: 'ip' }),
        (c) => c.json({ message: 'Hello from the public rate-limited endpoint!' })
    );


    app.all('/api/*', () => {
        throw new HttpError(404, 'not_found', 'Not found.');
    });

    return app;
}