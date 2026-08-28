import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Database } from 'better-sqlite3';
import type { AppEnv } from './env.ts';
import { handleError, HttpError } from './http/errors.ts';
import { authRoutes } from './routes/auth.ts';
import { grievanceRoutes } from './routes/grievances.ts';
import { attachmentRoutes } from './routes/attachments.ts';

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

    app.get('/api/health', (c) => c.json({ ok: true }));
    app.route('/api', authRoutes);
    app.route('/api/grievances', grievanceRoutes);
    app.route('/api/attachments', attachmentRoutes);


    app.all('/api/*', () => {
        throw new HttpError(404, 'not_found', 'Not found.');
    });

    return app;
}