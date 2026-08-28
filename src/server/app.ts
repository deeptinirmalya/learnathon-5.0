import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Database } from 'better-sqlite3';
import type { AppEnv } from './env.ts';
import { handleError, HttpError } from './http/errors.ts';
import { authRoutes } from './routes/auth.ts';
import { grievanceRoutes } from './routes/grievances.ts';
import { attachmentRoutes } from './routes/attachments.ts';
import { rateLimiter } from './http/rate_limit.ts';

export type CreateAppOptions = {
    db: Database;
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
            allowHeaders: ['Content-Type', 'Authorization'],
            maxAge: 600,
        })
    );


    app.onError((err, c) => handleError(err, c));


    app.notFound((c) => c.json({ error: 'Not found.', code: 'not_found' }, 404));

    app.route('/api', authRoutes);
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