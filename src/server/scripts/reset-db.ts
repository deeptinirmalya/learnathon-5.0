import '../load-env.ts';
import { resetDatabase } from '../db/reset.ts';

await resetDatabase();
console.log('Reset complete: Neon database and uploads/ restored to the seeded lab state.');

