import { config } from '../config.js';
import { AdsPowerClient } from '../lib/adspower.js';
import { connectToAdsPower, disconnectBrowser } from '../lib/browser.js';
import { sleep } from '../lib/formFiller.js';

async function testLaunch() {
  console.log('='.repeat(60));
  console.log('       TESTING ADSPOWER BROWSER LAUNCH & CDP LINK      ');
  console.log('='.repeat(60));

  const profileId = config.adspower.profileId;
  console.log(`[Test] Launching Profile: ${profileId}...`);

  const adsClient = new AdsPowerClient({
    apiBase: config.adspower.apiBase,
    apiKey: config.adspower.apiKey,
    profileId,
  });

  try {
    const { wsEndpoint } = await adsClient.startBrowser();
    console.log(`[Test] CDP WebSocket URL: ${wsEndpoint}`);

    console.log('[Test] Connecting Playwright over CDP...');
    const { browser, page } = await connectToAdsPower(wsEndpoint);

    console.log('[Test] Navigating to https://api.ipify.org?format=json to verify connection & IP...');
    await page.goto('https://api.ipify.org?format=json', { timeout: 30000 });
    const ipContent = await page.innerText('body');
    console.log(`[Test] Current Browser IP Output: ${ipContent.trim()}`);

    console.log('[Test] Waiting 5 seconds before closing...');
    await sleep(5000);

    console.log('[Test] Closing CDP connection...');
    await disconnectBrowser(browser);

    console.log('[Test] Stopping AdsPower profile...');
    await adsClient.stopBrowser(profileId);

    console.log('\n✓ Test completed successfully! AdsPower + Playwright are fully synchronized.\n');
  } catch (err) {
    console.error(`\n✗ Launch test failed: ${err.message}\n`);
    await adsClient.stopBrowser(profileId).catch(() => {});
  }
}

testLaunch();
