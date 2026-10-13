import { config } from '../config.js';
import { AdsPowerClient } from '../lib/adspower.js';
import { connectToAdsPower, captureErrorScreenshot, disconnectBrowser } from '../lib/browser.js';

// Read-only check: launches one profile, observes its exit IP, and loads one URL.
// It never fills or submits a form.
const targetUrl = process.argv[2];
const profileId = process.argv[3] || config.adspower.profilePool[0] || config.adspower.profileId;

if (!targetUrl || !/^https?:\/\//i.test(targetUrl) || !profileId) {
  console.error('Usage: npm run diagnose:vps -- <https://listing-url> [profile-id]');
  process.exitCode = 2;
} else {
  const client = new AdsPowerClient({
    apiBase: config.adspower.apiBase,
    apiKey: config.adspower.apiKey,
    profileId,
  });
  let browser;
  let page;
  let started = false;

  try {
    console.log(`[Diagnostic] Profile: ${profileId}`);
    console.log(`[Diagnostic] Browser headless: ${config.adspower.headless}`);
    console.log(`[Diagnostic] DISPLAY: ${process.env.DISPLAY || '(unset)'}`);
    console.log(`[Diagnostic] Target: ${targetUrl}`);

    const { wsEndpoint } = await client.startBrowser({ profileId, headless: config.adspower.headless });
    started = true;
    ({ browser, page } = await connectToAdsPower(wsEndpoint));

    try {
      const ipResponse = await page.goto('https://ipinfo.io/json', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      const ipText = await page.locator('body').innerText();
      const ipData = JSON.parse(ipText);
      console.log(`[Diagnostic] Browser exit IP: ${ipData.ip || '(missing)'}`);
      console.log(`[Diagnostic] Browser country: ${ipData.country || '(missing)'}`);
      console.log(`[Diagnostic] Browser network: ${ipData.org || '(missing)'}`);
      console.log(`[Diagnostic] IP check HTTP status: ${ipResponse?.status() ?? '(no response)'}`);
    } catch (error) {
      console.warn(`[Diagnostic] Browser IP check failed: ${error.message}`);
    }

    const response = await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: config.delays.navigationTimeout,
    });
    await page.waitForTimeout(2500);
    const title = await page.title().catch(() => '');
    const bodyText = await page.locator('body').innerText().catch(() => '');
    const denied = /access denied|forbidden/i.test(title) ||
      /access denied|request blocked/i.test(bodyText.slice(0, 3000)) ||
      response?.status() === 403;
    const reference = bodyText.match(/Reference\s*#?\s*[\w.:-]+/i)?.[0] || '(none found)';
    const screenshot = await captureErrorScreenshot(page, targetUrl, 'diagnostic');

    console.log(`[Diagnostic] Target HTTP status: ${response?.status() ?? '(no response)'}`);
    console.log(`[Diagnostic] Final URL: ${page.url()}`);
    console.log(`[Diagnostic] Page title: ${title}`);
    console.log(`[Diagnostic] Access denied: ${denied}`);
    console.log(`[Diagnostic] Page reference: ${reference}`);
    console.log(`[Diagnostic] Screenshot: ${screenshot || '(failed)'}`);
    if (denied) process.exitCode = 1;
  } catch (error) {
    console.error(`[Diagnostic] Failed: ${error.message}`);
    process.exitCode = 1;
    if (page) {
      const screenshot = await captureErrorScreenshot(page, targetUrl, 'diagnostic_error');
      if (screenshot) console.log(`[Diagnostic] Screenshot: ${screenshot}`);
    }
  } finally {
    if (browser) await disconnectBrowser(browser).catch(() => {});
    if (started) await client.stopBrowser(profileId).catch(() => {});
  }
}
