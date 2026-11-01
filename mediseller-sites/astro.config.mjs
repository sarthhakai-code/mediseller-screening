// One engine, many sites. Pick the site at build time:  SITE=mediseller npm run build
import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const SITE = process.env.SITE || 'mediseller';
const siteDir = fileURLToPath(new URL(`./sites/${SITE}/`, import.meta.url));
if (!existsSync(siteDir)) throw new Error(`Unknown SITE "${SITE}" — no folder sites/${SITE}/`);

const { default: cfg } = await import(`./sites/${SITE}/site.config.mjs`);

export default defineConfig({
  site: `https://${cfg.domain}`,
  output: 'static',
  publicDir: `./sites/${SITE}/public`,
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  vite: {
    resolve: { alias: { '@site': siteDir } },
  },
});
