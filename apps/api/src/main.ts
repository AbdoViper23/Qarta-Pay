import { z } from 'zod';
import { buildServer } from './server';

const env = z
  .object({ PORT: z.coerce.number().int().min(1).max(65535).default(4000) })
  .parse(process.env);

const app = buildServer();
await app.listen({ port: env.PORT, host: '0.0.0.0' });
console.log(`api listening on :${env.PORT}`);
