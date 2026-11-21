/* Run the API locally, no Cloudflare needed:  node dev.mjs  ->  http://localhost:8787
   Settings come from wrangler.toml [vars]; secrets from .dev.vars (KEY=value lines,
   never committed; copy .dev.vars.example). */
import http from 'node:http';
import fs from 'node:fs';
import worker from './src/index.js';

const here = new URL('.', import.meta.url);
const env = {};
let inVars = false;
for (const line of fs.readFileSync(new URL('wrangler.toml', here), 'utf8').split(/\r?\n/)) {
  if (/^\s*\[/.test(line)) { inVars = /^\s*\[vars\]/.test(line); continue; }
  const m = inVars && line.match(/^\s*([A-Z_]+)\s*=\s*"(.*)"\s*$/);
  if (m) env[m[1]] = m[2];
}
const devVars = new URL('.dev.vars', here);
if (fs.existsSync(devVars)) {
  for (const line of fs.readFileSync(devVars, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
} else {
  console.warn('No .dev.vars: copy .dev.vars.example to .dev.vars and fill it in.');
}

const PORT = Number(process.env.PORT || 8787);
http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const request = new Request(`http://localhost:${PORT}${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks)
  });
  const response = await worker.fetch(request, env);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
  console.log(`${req.method} ${req.url} -> ${response.status}`);
}).listen(PORT, '127.0.0.1', () => console.log(`Dashboard API on http://localhost:${PORT}`));
