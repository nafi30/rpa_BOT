import { config } from '../config.js';
import { AdsPowerClient } from '../lib/adspower.js';
import { connectToAdsPower, disconnectBrowser } from '../lib/browser.js';
import { fillContactForm, validateInquiryFields } from '../lib/formFiller.js';
import { getSelectorsForUrl } from '../selectors.config.js';

const url = process.argv[2];
const profileId = process.argv[3] || config.adspower.profilePool[0];
if (!url || !profileId) throw new Error('Usage: node scripts/inspectHotpadsInquiry.js <url> [profile-id]');
const client = new AdsPowerClient({
  apiBase: config.adspower.apiBase,
  apiKey: config.adspower.apiKey,
  profileId,
});
let browser;
let started = false;
try {
  const { wsEndpoint } = await client.startBrowser({ profileId, headless: config.adspower.headless });
  started = true;
  const connected = await connectToAdsPower(wsEndpoint);
  browser = connected.browser;
  const page = connected.page;
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2500);
  console.log('HTTP', response?.status());
  console.log('TITLE', await page.title());
  const controls = await page.locator('button, a, [role="button"]').evaluateAll((els) =>
    els.filter((el) => /contact|message/i.test((el.textContent || '').trim()))
      .slice(0, 20)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
        id: el.id,
        className: typeof el.className === 'string' ? el.className.slice(0, 100) : '',
        visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
      }))
  );
  console.log('CONTACT_CONTROLS', JSON.stringify(controls));
  const inputs = await page.locator('input, textarea').evaluateAll((els) =>
    els.filter((el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length))
      .slice(0, 30)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        name: el.getAttribute('name'),
        id: el.id,
        placeholder: el.getAttribute('placeholder'),
        type: el.getAttribute('type'),
      }))
  );
  console.log('VISIBLE_INPUTS', JSON.stringify(inputs));
  if (process.env.DRY_FILL === 'true') {
    const lead = {
      name: 'Hassam Abbas',
      email: 'test@example.com',
      phone: '(949) 620-0776',
      message: 'Dry run only. This form will not be submitted.',
    };
    const result = await fillContactForm(page, lead, getSelectorsForUrl(url));
    console.log('DRY_FILLED_FIELDS', result.filledFields.join(','));
    console.log('DRY_MISSING_REQUIRED', validateInquiryFields(result, lead).join(',') || '(none)');
    console.log('DRY_SUBMIT_ENABLED', await page.getByRole('button', { name: /send message/i }).first().isEnabled().catch(() => false));
    console.log('DRY_RUN_NO_SUBMIT', true);
  }
} finally {
  if (browser) await disconnectBrowser(browser).catch(() => {});
  if (started) await client.stopBrowser(profileId).catch(() => {});
}
