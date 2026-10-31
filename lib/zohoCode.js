import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const script = fileURLToPath(new URL('../scripts/waitZohoCode.py', import.meta.url));

/** Wait for a fresh code addressed to the exact alias used on the form. */
export function waitForZohoCode(recipient, sinceEpochMs = Date.now(), settings = config.zoho) {
  if (!settings.user || !settings.appPassword) {
    throw new Error('Zoho IMAP credentials are missing; verification cannot complete.');
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)) {
    throw new Error('Invalid verification recipient.');
  }
  return new Promise((resolve, reject) => {
    const child = spawn(process.platform === 'win32' ? 'python' : 'python3', [script], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ZOHO_IMAP_HOST: settings.host,
        ZOHO_IMAP_PORT: String(settings.port),
        ZOHO_IMAP_USER: settings.user,
        ZOHO_IMAP_APP_PASSWORD: settings.appPassword,
      },
    });
    let output = '';
    let errorOutput = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { errorOutput += chunk; });
    child.on('error', (error) => reject(new Error(`Zoho reader could not start: ${error.message}`)));
    child.on('close', (exitCode) => {
      if (exitCode !== 0) {
        reject(new Error(`Zoho reader failed (${exitCode}): ${errorOutput.trim() || 'IMAP error'}`));
        return;
      }
      try {
        const result = JSON.parse(output.trim());
        if (!/^\d{6}$/.test(result.code || '')) {
          reject(new Error('No fresh HotPads code arrived for this alias before the timeout.'));
          return;
        }
        resolve(result.code);
      } catch {
        reject(new Error('Zoho reader returned an invalid response.'));
      }
    });
    child.stdin.end(JSON.stringify({
      recipient,
      sinceEpochMs,
      timeoutMs: settings.timeoutMs,
      folders: settings.folders,
    }));
  });
}
