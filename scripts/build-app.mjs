import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { argv } from 'node:process';
import { build } from 'esbuild';

const appName = argv[2];
if (appName !== 'api' && appName !== 'worker') {
  throw new Error('Usage: node scripts/build-app.mjs <api|worker>');
}

const repositoryRoot = resolve(import.meta.dirname, '..');
const applicationRoot = resolve(repositoryRoot, 'apps', appName);
const outputDirectory = resolve(applicationRoot, 'dist');

await build({
  entryPoints: [resolve(applicationRoot, 'src', 'index.ts')],
  outfile: resolve(outputDirectory, 'index.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  minify: false,
  packages: 'bundle',
  external: ['@fastify/*', 'fastify', 'openai', 'pino', 'postgres', 'zod'],
  logLevel: 'info',
});

await mkdir(resolve(outputDirectory, 'migrations'), { recursive: true });
await cp(
  resolve(repositoryRoot, 'packages', 'db', 'migrations'),
  resolve(outputDirectory, 'migrations'),
  { recursive: true },
);
