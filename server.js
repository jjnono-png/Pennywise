
/* Pennywise – server.js
   A tiny Node.js server (no packages to install).
   It serves the website and saves your data
   to data/pennywise.json through a small JSON API.
*/
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

// Render provides PORT automatically.
// Locally, the application defaults to port 3000.
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const ROOT = __dirname;

const DATA = path.join(ROOT, 'data', 'pennywise.json');

const PUBLIC = new Set([
  'index.html',
  'config.json',
  'css/styles.css',
  'js/app.js'
]);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

// Read saved data.
const readData = () => {
  try {
    return JSON.parse(fs.readFileSync(DATA, 'utf8'));
  } catch (e) {
    return { tx: [], goals: [] };
  }
};

// Send HTTP response.
function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });

  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // JSON API
  if (url.pathname === '/api/data') {

    if (req.method === 'GET') {
      return send(res, 200, JSON.stringify(readData()));
    }

    if (req.method !== 'PUT') {
      return send(res, 405, '{"error":"Method not allowed"}');
    }

    let body = '';
    let bytes = 0;

    req.on('data', c => {
      bytes += c.length;

      if (bytes > 5e6) {
        req.destroy();
      } else {
        body += c;
      }
    });

    req.on('end', () => {
      try {
        const d = JSON.parse(body);

        if (!Array.isArray(d.tx) || !Array.isArray(d.goals)) {
          throw new Error('Invalid data');
        }

        fs.mkdirSync(path.dirname(DATA), {
          recursive: true
        });

        fs.writeFileSync(
          DATA + '.tmp',
          JSON.stringify({ tx: d.tx, goals: d.goals }, null, 2)
        );

        // Safe save: avoids leaving a half-written file.
        fs.renameSync(DATA + '.tmp', DATA);

        send(res, 200, '{"ok":true}');

      } catch (e) {
        send(res, 400, '{"error":"Invalid data"}');
      }
    });

    return;
  }

  // Website files
  const file = url.pathname === '/'
    ? 'index.html'
    : url.pathname.slice(1);

  if (!PUBLIC.has(file)) {
    return send(res, 404, 'Not found', 'text/plain');
  }

  fs.readFile(path.join(ROOT, file), (err, buf) => {
    if (err) {
      return send(res, 404, 'Not found', 'text/plain');
    }

    send(
      res,
      200,
      buf,
      TYPES[path.extname(file)]
    );
  });
});

// IMPORTANT: Bind to 0.0.0.0 so Render can detect the server.
server.listen(PORT, HOST, () => {
  console.log('===================================');
  console.log('       PENNYWISE APPLICATION');
  console.log('===================================');
  console.log(`Server listening on ${HOST}:${PORT}`);
  console.log(`Local access: http://localhost:${PORT}`);
  console.log('===================================');
});
