import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import '../config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'demo', 'output');
fs.mkdirSync(outputDir, { recursive: true });
const leadsFile = path.join(outputDir, 'leads.csv');
const resultsFile = path.join(outputDir, 'results.csv');
const screenshotsDir = path.join(outputDir, 'screenshots');
if (fs.existsSync(resultsFile)) fs.unlinkSync(resultsFile);
let received = 0;

const html = '<!doctype html><html lang="en"><meta charset="utf-8"><title>Demo Rental Listing</title>' +
  '<style>body{font:18px Arial,sans-serif;max-width:650px;margin:40px auto}label{display:block;margin:12px 0}input,textarea{display:block;width:100%;padding:8px}#inquiry{display:none}</style>' +
  '<h1>Demo Rental Listing</h1><p>This local test never contacts a real property.</p>' +
  '<button id="open" type="button" onclick="document.getElementById(&quot;inquiry&quot;).style.display=&quot;block&quot;;this.style.display=&quot;none&quot;">Send Message</button>' +
  '<form id="inquiry" action="/inquiry" method="post">' +
  '<label>First Name<input name="firstName" required></label>' +
  '<label>Last Name<input name="lastName" required></label>' +
  '<label>Email<input type="email" name="email" required></label>' +
  '<label>Phone<input type="tel" name="phone"></label>' +
  '<label>Message<textarea name="message" required></textarea></label>' +
  '<button type="submit">Send Message</button></form></html>';

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/property') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } else if (req.method === 'POST' && req.url === '/inquiry') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      const fields = new URLSearchParams(body);
      if (!fields.get('firstName') || !fields.get('email') || !fields.get('message')) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h1>Missing inquiry fields</h1>');
        return;
      }
      received++;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<title>Inquiry received</title><div class="success-message">Thank you! Your inquiry has been received by the local demo.</div>');
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const demoUrl = 'http://127.0.0.1:' + port + '/property';
fs.writeFileSync(leadsFile,
  'url,name,email,phone,message\n' +
  '"' + demoUrl + '",Demo Renter,demo@example.invalid,555-0100,"This is a demo inquiry. No external property is contacted."\n'
);
console.log('[Demo] Local listing: ' + demoUrl);
console.log('[Demo] Running the real bot against one local inquiry form. No external message will be sent.');
const env = {
  ...process.env,
  INPUT_LEADS_FILE: leadsFile,
  OUTPUT_RESULTS_FILE: resultsFile,
  SCREENSHOTS_DIR: screenshotsDir,
  ALLOWED_LEAD_DOMAINS: '127.0.0.1',
  WEBHOOK_URL: '',
  HEADLESS: 'false',
};
const child = spawn(process.execPath, ['index.js'], { cwd: root, env, stdio: 'inherit' });
const code = await new Promise((resolve) => child.on('exit', (exitCode) => resolve(exitCode)));
await new Promise((resolve) => server.close(resolve));
console.log('[Demo] Local inquiries received: ' + received);
console.log('[Demo] Results: ' + resultsFile);
const confirmed = fs.existsSync(resultsFile) && /,SUCCESS,/.test(fs.readFileSync(resultsFile, 'utf8'));
if (code !== 0 || received !== 1 || !confirmed) process.exitCode = 1;
