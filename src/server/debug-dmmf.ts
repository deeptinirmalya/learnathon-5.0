import './load-env.ts';
import { Prisma } from '@prisma/client';
const dmmf = (Prisma as any).dmmf;
const model = dmmf?.datamodel?.models?.find((m: any) => m.name === 'User');
const field = model?.fields?.find((f: any) => f.name === 'role');
console.log('role field:', JSON.stringify(field));
const enums = dmmf?.datamodel?.enums?.map((e: any) => e.name);
console.log('enums:', enums);