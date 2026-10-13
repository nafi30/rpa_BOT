import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { sleep, randomBetween } from './formFiller.js';

export class AccessDeniedError extends Error {
  constructor(url, status, title) {
    super(`Target denied access to ${url} (HTTP ${status ?? 'unknown'}, title: ${title || '(empty)'}).`);
    this.name = 'AccessDeniedError';
    this.code = 'ACCESS_DENIED';
  }
}

/**
 * Connects Playwright to an existing AdsPower Chromium instance via CDP.
 * @param {string} wsEndpoint - WebSocket CDP URL provided by AdsPower Local API
 * @returns {Promise<{ browser: import('playwright-core').Browser, context: import('playwright-core').BrowserContext, page: import('playwright-core').Page }>}
 */
export async function connectToAdsPower(wsEndpoint) {
  console.log(`[Browser] Connecting Playwright over CDP to: ${wsEndpoint}`);

  const browser = await chromium.connectOverCDP(wsEndpoint);
  const contexts = browser.contexts();
  const context = contexts.length > 0 ? contexts[0] : await browser.newContext();

  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();

  // Set default timeouts
  page.setDefaultTimeout(config.delays.navigationTimeout);
  page.setDefaultNavigationTimeout(config.delays.navigationTimeout);

  // AdsPower SunBrowser manages anti-detect fingerprinting natively at kernel level

  return { browser, context, page };
}

/**
 * Safely navigates to a URL with retry logic and humanized scroll behavior.
 * @param {import('playwright-core').Page} page
 * @param {string} url
 * @param {number} [maxRetries=2]
 */
export async function safeNavigate(page, url, maxRetries = 2) {
  let attempt = 0;
  let lastError = null;

  while (attempt <= maxRetries) {
    try {
      console.log(`[Browser] Navigating to ${url} (Attempt ${attempt + 1}/${maxRetries + 1})...`);

      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: config.delays.navigationTimeout,
      });

      // Human settle delay to allow SPA / React dynamic hydration over proxy
      await sleep(randomBetween(2500, 4000));

      const pageTitle = await page.title().catch(() => '');
      if ([403, 429].includes(response?.status()) || pageTitle.toLowerCase().includes('access denied')) {
        throw new AccessDeniedError(page.url(), response?.status(), pageTitle);
      }

      // Simulate a natural micro-scroll to trigger lazy-loaded forms/scripts
      await page.evaluate(() => {
        window.scrollBy({ top: 350, behavior: 'smooth' });
      }).catch(() => {});
      await sleep(randomBetween(800, 1500));

      return response;
    } catch (err) {
      if (err.code === 'ACCESS_DENIED') throw err;
      lastError = err;
      attempt++;
      console.warn(`[Browser] Navigation attempt ${attempt} failed: ${err.message}`);
      if (attempt <= maxRetries) {
        await sleep(3000);
      }
    }
  }

  throw new Error(`Failed to navigate to ${url} after ${maxRetries + 1} attempts: ${lastError.message}`);
}

/**
 * Takes an error screenshot and saves it to the configured screenshots directory.
 * @param {import('playwright-core').Page} page
 * @param {string} url
 * @param {string} statusLabel
 * @returns {Promise<string|null>} Path to saved screenshot or null
 */
export async function captureErrorScreenshot(page, url, statusLabel = 'error') {
  try {
    const dir = config.files.screenshotsDir;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const sanitizedUrl = url.replace(/https?:\/\//, '').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);
    const timestamp = Date.now();
    const filename = `${statusLabel}_${sanitizedUrl}_${timestamp}.png`;
    const filePath = path.join(dir, filename);

    if (page && !page.isClosed()) {
      await page.screenshot({ path: filePath, fullPage: false });
      console.log(`[Browser] Error screenshot captured: ${filePath}`);
      return filePath;
    }
  } catch (err) {
    console.warn(`[Browser] Warning: Could not capture screenshot: ${err.message}`);
  }
  return null;
}

/**
 * Gracefully disconnects Playwright from the CDP session.
 * @param {import('playwright-core').Browser} browser
 */
export async function disconnectBrowser(browser) {
  if (browser && browser.isConnected()) {
    try {
      await browser.close();
      console.log('[Browser] Playwright CDP connection closed.');
    } catch (err) {
      console.warn(`[Browser] Disconnect warning: ${err.message}`);
    }
  }
}

export default {
  connectToAdsPower,
  safeNavigate,
  captureErrorScreenshot,
  disconnectBrowser,
};
