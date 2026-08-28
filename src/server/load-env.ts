// This file must be the FIRST import in index.ts.
// Because ES module imports are hoisted, this runs before any other module
// initializes, ensuring process.env is populated from .env before config.ts reads it.
import { readFileSync, existsSync } from 'node:fs';

const envPath = new URL('../../.env', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');

if (existsSync(envPath)) {
	const lines = readFileSync(envPath, 'utf-8').split('\n');
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const eqIdx = trimmed.indexOf('=');
		if (eqIdx === -1) continue;
		const key = trimmed.slice(0, eqIdx).trim();
		const value = trimmed.slice(eqIdx + 1).trim();
		if (key && !(key in process.env)) {
			process.env[key] = value;
		}
	}
	console.log('✅ .env loaded from', envPath);
} else {
	console.warn('⚠️  No .env file found at', envPath);
}
