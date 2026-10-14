// Connectiv Technologies and Solutions - website server
// Serves the static site in ./public using only Node's built-in modules (no npm install needed).
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
};

// connectiv.in previously hosted a GoDaddy "coming soon" site. Browsers that visited it may still
// run its service worker and keep showing the old page. Our site has no JavaScript files, so any
// .js request is that old worker checking for updates: answer with a worker that removes itself
// and reloads the open tabs onto the current site.
const KILL_SWITCH_WORKER = `
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const tabs = await self.clients.matchAll({ type: 'window' });
    tabs.forEach((tab) => tab.navigate(tab.url));
  })());
});
`;

const server = http.createServer((req, res) => {
  // Redirect www.connectiv.in -> connectiv.in
  const host = req.headers.host || '';
  if (host.startsWith('www.')) {
    res.writeHead(301, { Location: `https://${host.slice(4)}${req.url}` });
    return res.end();
  }

  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400);
    return res.end('Bad request');
  }
  // Lightweight endpoint for the hosting platform's health checks
  if (urlPath === '/health' || urlPath === '/healthz' || urlPath === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end('ok');
  }

  if (urlPath.endsWith('.js')) {
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(KILL_SWITCH_WORKER);
  }

  if (urlPath.endsWith('/')) urlPath += 'index.html';

  // Block path traversal: the resolved file must stay inside ./public
  const filePath = path.resolve(PUBLIC_DIR, '.' + urlPath);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // Old coming-soon page links (e.g. /contact-us) go to the home page instead of a dead end
      if (!path.extname(urlPath)) {
        res.writeHead(302, { Location: '/' });
        return res.end();
      }
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('<h1>Page not found</h1><p><a href="/">Go to Connectiv home</a></p>');
    }
    const ext = path.extname(filePath).toLowerCase();
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      // Cache images for 30 days; always re-check the HTML so updates show immediately
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=2592000',
      'X-Content-Type-Options': 'nosniff',
    };
    // Wipe anything the old coming-soon site left in the visitor's browser (cached pages, service workers)
    if (ext === '.html') headers['Clear-Site-Data'] = '"cache", "storage"';
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`Connectiv website running on port ${PORT}`);
});
