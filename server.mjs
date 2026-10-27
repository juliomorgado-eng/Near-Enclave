// Zero-dependency static server for Railway: serves the Astro build in dist/ on $PORT.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), 'dist');
const port = Number(process.env.PORT) || 8080;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

// Resolve /v4a-near, /v4a-near/ and /v4a-near/index.html to the same file.
async function resolve(pathname) {
  const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const base = join(root, safe);
  if (!base.startsWith(root)) return null;
  for (const candidate of [base, join(base, 'index.html'), `${base}.html`]) {
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {}
  }
  return null;
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  const file = await resolve(pathname);
  if (!file) {
    const notFound = await resolve('/404.html');
    res.writeHead(404, { 'content-type': types['.html'] });
    res.end(notFound ? await readFile(notFound) : 'Not found');
    return;
  }
  const ext = extname(file).toLowerCase();
  // Astro emits hashed filenames under /_astro, so those can be cached forever.
  const cache = pathname.startsWith('/_astro/') ? 'public, max-age=31536000, immutable' : 'public, max-age=300';
  res.writeHead(200, { 'content-type': types[ext] || 'application/octet-stream', 'cache-control': cache });
  res.end(await readFile(file));
}).listen(port, '0.0.0.0', () => console.log(`Serving dist/ on :${port}`));
