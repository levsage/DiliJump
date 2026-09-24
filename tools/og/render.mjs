/**
 * Renders tools/og/og-image.html → public/og-image.jpg (1200×630).
 * Usage: npm run og-image   (needs `npx playwright install chromium` once)
 */
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const types = {
  '.html': 'text/html',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.json': 'application/json',
};

// tiny static server (fetch() of local JSON doesn't work over file://)
const server = createServer(async (req, res) => {
  try {
    const path = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!path.startsWith(root)) throw new Error('outside root');
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
    res.end(await readFile(path));
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);
const { port } = server.address();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(`http://localhost:${port}/tools/og/og-image.html`);
await page.waitForSelector('body[data-ready="1"]');
await page.waitForLoadState('networkidle');
await page.screenshot({ path: join(root, 'public/og-image.jpg'), type: 'jpeg', quality: 88 });
await browser.close();
server.close();
console.log('public/og-image.jpg written');
