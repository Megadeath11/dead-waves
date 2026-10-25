// Tiny static server for testing in a browser: node tools/serve.js  ->  http://127.0.0.1:8650/
// Add ?fake=1001 / ?fake=1002 in two tabs to test co-op without Steam.
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), port = +process.argv[2] || 8650;
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' };
http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const p = path.normalize(path.join(root, url === '/' ? 'index.html' : url));
  if (!p.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(p, (e, d) => {
    if (e) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(d);
  });
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/`));
