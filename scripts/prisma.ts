import { loadEnvConfig } from '@next/env';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
loadEnvConfig(process.cwd());
const result = spawnSync(
  process.execPath,
  [resolve('node_modules/prisma/build/index.js'), ...process.argv.slice(2)],
  { stdio: 'inherit', env: process.env },
);
process.exit(result.status ?? 1);
