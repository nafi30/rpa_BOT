import { execSync } from 'child_process';
import { config } from '../config.js';
import { AdsPowerClient } from '../lib/adspower.js';
import { connectToAdsPower, disconnectBrowser } from '../lib/browser.js';
import { sleep } from '../lib/formFiller.js';

if (process.platform === 'linux') {
  try {
    const isXvfbRunning = execSync('pgrep -f "Xvfb :99" || true').toString().trim();
    if (!isXvfbRunning) {
      execSync('which Xvfb > /dev/null || (apt-get update && apt-get install -y xvfb)');
      execSync('nohup Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp > /dev/null 2>&1 &');
    }
    process.env.DISPLAY = process.env.DISPLAY || ':99';
  } catch {}
}

const targetUrl = process.argv[2] || 'https://www.apartments.com/cmpnd-miami-miami-fl/tlrs2nc/';
const profileId = process.argv[3] || config.adspower.profileId || config.adspower.profilePool[0];

async function diagnose() {
  console.log('='.repeat(70));
  console.log(`        DIAGNOSING APARTMENTS.COM DOM & BOT DETECTION        `);
  console.log('='.repeat(70));
  console.log(`Target URL: ${targetUrl}`);
  console.log(`Profile ID: ${profileId}`);

  const adsClient = new AdsPowerClient({
    apiBase: config.adspower.apiBase,
    apiKey: config.adspower.apiKey,
    profileId,
  });

  try {
    console.log('[AdsPower] Starting profile...');
    const { wsEndpoint } = await adsClient.startBrowser({ profileId, headless: config.adspower.headless });
    const { browser, page } = await connectToAdsPower(wsEndpoint);

    console.log(`[Browser] Navigating to ${targetUrl}...`);
    const resp = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    console.log(`[Browser] HTTP Status: ${resp ? resp.status() : 'N/A'}`);

    await sleep(3000);

    const title = await page.title();
    const finalUrl = page.url();
    console.log(`[Browser] Final URL: ${finalUrl}`);
    console.log(`[Browser] Page Title: "${title}"`);

    // Check for Cloudflare / PerimeterX / Bot Challenge
    const bodyText = await page.innerText('body').catch(() => '');
    const isCloudflare = bodyText.includes('Attention Required') || bodyText.includes('Just a moment') || bodyText.includes('Verify you are human') || title.includes('Just a moment');
    const isBlocked = bodyText.includes('Access Denied') || bodyText.includes('403 Forbidden') || bodyText.includes('ShieldSquare') || bodyText.includes('PerimeterX');

    console.log('\n--- Bot Detection Check ---');
    console.log(`Cloudflare Challenge Detected : ${isCloudflare ? 'YES ⚠' : 'NO ✓'}`);
    console.log(`Access Blocked / 403 Forbidden : ${isBlocked ? 'YES ⚠' : 'NO ✓'}`);

    // Inspect Elements
    const elementsReport = await page.evaluate(() => {
      const allButtons = Array.from(document.querySelectorAll('button, a, [role="button"]'));
      const contactElements = allButtons.filter(el => {
        const txt = (el.innerText || el.textContent || '').toLowerCase();
        const id = (el.id || '').toLowerCase();
        const cls = (el.className || '').toLowerCase();
        return txt.includes('contact') || txt.includes('message') || id.includes('contact') || cls.includes('contact') || id.includes('message');
      }).map(el => ({
        tag: el.tagName,
        id: el.id,
        className: el.className,
        text: (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' '),
        offsetParent: el.offsetParent !== null,
      }));

      const inputs = Array.from(document.querySelectorAll('input, textarea')).map(el => ({
        tag: el.tagName,
        id: el.id,
        name: el.name,
        type: el.type,
        placeholder: el.placeholder,
        offsetParent: el.offsetParent !== null,
      }));

      return { contactElements, inputs };
    });

    console.log('\n--- Contact Triggers Found in DOM ---');
    console.log(JSON.stringify(elementsReport.contactElements, null, 2));

    console.log('\n--- Input Fields in DOM ---');
    console.log(JSON.stringify(elementsReport.inputs.slice(0, 15), null, 2));

    await page.screenshot({ path: './screenshots/diagnose_view.png', fullPage: false });
    console.log('\n✓ Saved viewport screenshot to ./screenshots/diagnose_view.png');

    await disconnectBrowser(browser);
    await adsClient.stopBrowser(profileId);
  } catch (err) {
    console.error(`✗ Diagnosis failed: ${err.message}`);
    await adsClient.stopBrowser(profileId).catch(() => {});
  }
}

diagnose();
