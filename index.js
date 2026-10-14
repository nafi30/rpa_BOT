import fs from 'fs';
import axios from 'axios';
import { config, validateConfig } from './config.js';
import { AdsPowerClient } from './lib/adspower.js';
import { CapSolverClient } from './lib/capsolver.js';
import { connectToAdsPower, safeNavigate, captureErrorScreenshot, disconnectBrowser } from './lib/browser.js';
import { fillContactForm, validateInquiryFields, submitContactForm, sleep, randomBetween } from './lib/formFiller.js';
import { getSelectorsForUrl } from './selectors.config.js';
import { loadLeads, getProcessedUrls, logResult, isAllowedLeadUrl } from './lib/dataManager.js';
import { generateMessage } from './lib/spintaxEngine.js';
import { selectProfileIndex, selectSenderEmail } from './lib/rotation.js';
import { syncGoogleSheet } from './scripts/syncGoogleSheet.js';

function ensureXvfbEnvironment() {
  if (process.platform !== 'linux' || config.adspower.headless) return;
  process.env.DISPLAY ||= ':99';
  const localDisplay = process.env.DISPLAY.match(/^:(\d+)/);
  if (localDisplay && !fs.existsSync(`/tmp/.X11-unix/X${localDisplay[1]}`)) {
    throw new Error(`DISPLAY=${process.env.DISPLAY} has no X11 socket. Start Xvfb before the bot.`);
  }
  console.log(`[Display] Bot DISPLAY: ${process.env.DISPLAY}; the AdsPower runtime needs the same display.`);
}

// Global reference for clean shutdown
let activeBrowser = null;
let currentProfileId = null;
let adsClient = null;

// Graceful exit handlers
let shuttingDown = false;
async function cleanupOnExit(exitCode = process.exitCode || 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\n[Shutdown] Cleaning up active sessions before exit...');
  if (activeBrowser) {
    await disconnectBrowser(activeBrowser).catch(() => {});
  }
  if (adsClient && currentProfileId) {
    await adsClient.stopBrowser(currentProfileId).catch(() => {});
  }
  process.exit(exitCode);
}

process.on('SIGINT', () => cleanupOnExit(130));
process.on('SIGTERM', () => cleanupOnExit(143));

async function main() {
  ensureXvfbEnvironment();
  console.log('='.repeat(70));
  console.log('       RPA PROPERTY LEAD AUTOMATION BOT       ');
  console.log('       AdsPower + Playwright + CapSolver       ');
  console.log('='.repeat(70));

  // 1. Configuration Validation
  const validation = validateConfig({ requireLiveCredentials: false });
  if (!validation.valid) {
    console.error('\n[Config Error] Configuration validation issues detected:');
    validation.errors.forEach((err) => console.error(` - ${err}`));
    console.error('\nPlease update your .env file with the proper parameters.\n');
    process.exit(1);
  }

  // Initialize service clients
  adsClient = new AdsPowerClient({
    apiBase: config.adspower.apiBase,
    apiKey: config.adspower.apiKey,
    profileId: config.adspower.profileId,
    serialNumber: config.adspower.serialNumber,
  });

  const capSolver = new CapSolverClient({
    apiKey: config.capsolver.apiKey,
    pollIntervalMs: config.capsolver.pollIntervalMs,
    timeoutMs: config.capsolver.timeoutMs,
    proxy: config.capsolver.proxy,
  });

  // 2. Refresh the n8n-populated sheet before reading leads. Fail closed if sync fails.
  if (process.env.GOOGLE_SHEET_URL?.trim()) {
    const synced = await syncGoogleSheet(process.env.GOOGLE_SHEET_URL.trim(), config.files.inputLeads);
    if (!synced) throw new Error('Google Sheet sync failed; refusing to process stale leads.');
  }

  // 3. Ingest Leads
  console.log(`\n[DataManager] Loading leads from: ${config.files.inputLeads}`);
  let leads = [];
  try {
    leads = await loadLeads(config.files.inputLeads);
    console.log(`[DataManager] Loaded ${leads.length} total lead(s).`);
  } catch (err) {
    console.error(`[DataManager] Failed to load leads: ${err.message}`);
    process.exit(1);
  }

  if (leads.length === 0) {
    console.log('[DataManager] No valid leads found with a URL. Exiting.');
    return;
  }

  // 3. Deduplication Check (skip confirmed and unverified submissions)
  const processedUrls = await getProcessedUrls(config.files.outputResults, { onlySuccessful: true });
  const eligibleLeads = leads.filter((lead) => isAllowedLeadUrl(lead.url, config.files.allowedLeadDomains));
  const unsupportedCount = leads.length - eligibleLeads.length;
  const seenUrls = new Set();
  const queue = eligibleLeads.map((lead, sourceIndex) => ({ lead, sourceIndex })).filter(({ lead }) => {
    if (processedUrls.has(lead.url) || seenUrls.has(lead.url)) return false;
    seenUrls.add(lead.url);
    return true;
  });
  console.log(`[DataManager] ${unsupportedCount} lead(s) skipped outside allowed domains: ${config.files.allowedLeadDomains.join(', ')}.`);
  console.log(`[DataManager] ${processedUrls.size} previously submitted lead(s) skipped.`);
  console.log(`[DataManager] ${queue.length} lead(s) ready in active queue.`);

  if (queue.length === 0) {
    console.log('[DataManager] All leads have already been processed. Nothing to do!');
    return;
  }

  // Blank sheet emails must resolve to the complete configured eight-inbox pool.
  if (queue.some(({ lead }) => !lead.email)) {
    const inboxes = config.sender.emails;
    const valid = inboxes.length === 8 && new Set(inboxes.map((email) => email.toLowerCase())).size === 8 &&
      inboxes.every((email) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email));
    if (!valid) throw new Error('Blank lead emails require eight distinct valid SENDER_EMAILS entries.');
    console.log(`[Rotation] ${inboxes.length} sender inboxes configured for blank sheet emails.`);
  }

  // Resolve Profile Pool
  const profilePool = config.adspower.profilePool.length > 0
    ? config.adspower.profilePool
    : [config.adspower.profileId || config.adspower.serialNumber];

  console.log(`\n[Rotation] Profile Pool: ${profilePool.length} profile(s) [${profilePool.join(', ')}]`);
  console.log(`[Rotation] Strategy: ${config.adspower.rotationStrategy.toUpperCase()}${config.adspower.rotationStrategy === 'batch' ? ` (${config.adspower.leadsPerProfile} leads/profile)` : ''}`);

  // 4. Execution Loop
  let successfulSubmissions = 0;
  let unverifiedSubmissions = 0;
  let failedSubmissions = 0;
  let totalCaptchasSolved = 0;
  let accessDenied = false;
  let persistenceFailed = false;
  let processedCount = 0;

  for (let i = 0; i < queue.length; i++) {
    const { lead, sourceIndex } = queue[i];
    const leadIndex = i + 1;
    const startTime = Date.now();

    // Use the original sheet position so retries keep the same profile and inbox.
    const profileIndex = selectProfileIndex(
      sourceIndex, profilePool.length, config.adspower.rotationStrategy, config.adspower.leadsPerProfile,
    );
    currentProfileId = profilePool[profileIndex];

    if (!lead.email) lead.email = selectSenderEmail(sourceIndex, config.sender.emails);
    if (!lead.name || lead.name === 'Interested Buyer' || lead.name.toLowerCase() === 'henry') {
      lead.name = config.sender.defaultName || 'Hassam Abbas';
    }
    if (!lead.phone && config.sender.defaultPhone) {
      lead.phone = config.sender.defaultPhone;
    }

    console.log('\n' + '-'.repeat(70));
    console.log(`[Queue ${leadIndex}/${queue.length}] Target: ${lead.url}`);
    console.log(`[Profile ${profileIndex + 1}/${profilePool.length}] Active Profile: ${currentProfileId}`);
    console.log(`Sender Identity: ${lead.name} | Email: ${lead.email || 'N/A'} | Phone: ${lead.phone || 'N/A'}`);

    // Blank sheet messages use the fixed first outreach; follow-ups are outside this bot.
    lead.message = generateMessage({
      rawMessage: lead.message,
      leadName: lead.name,
    });
    console.log(`[Message] First inquiry prepared (${lead.message.length} characters).`);
    console.log('-'.repeat(70));

    let playwrightBrowser = null;
    let page = null;
    let runStatus = 'UNKNOWN';
    let captchaSolved = 'N/A';
    let runMessage = '';
    let proofScreenshotPath = '';

    try {
      // Step A: Launch AdsPower Profile
      console.log(`[AdsPower] Starting profile (${currentProfileId})...`);
      const { wsEndpoint } = await adsClient.startBrowser({
        profileId: currentProfileId,
        headless: config.adspower.headless,
      });

      // Step B: Connect Playwright over CDP
      const connection = await connectToAdsPower(wsEndpoint);
      playwrightBrowser = connection.browser;
      activeBrowser = playwrightBrowser;
      page = connection.page;

      // Step C: Navigate to Target URL
      await safeNavigate(page, lead.url);
      const pageTitle = await page.title().catch(() => '');
      const currentUrl = page.url();
      console.log(`[Browser] Landed on: ${currentUrl} | Page Title: "${pageTitle}"`);

      // Pre-flight check for Cloudflare / Turnstile challenges on landing
      const preFlightCaptcha = await capSolver.detectCaptcha(page);
      if (preFlightCaptcha.detected) {
        console.log(`[CapSolver] Pre-flight challenge detected! Type: ${preFlightCaptcha.type}, Key: ${preFlightCaptcha.siteKey}`);
        const solveResult = await capSolver.solve({
          type: preFlightCaptcha.type,
          websiteURL: preFlightCaptcha.pageUrl || lead.url,
          websiteKey: preFlightCaptcha.siteKey,
          isInvisible: preFlightCaptcha.isInvisible || false,
        });
        if (solveResult.success && solveResult.token) {
          await capSolver.injectTokenAndTrigger(page, solveResult.token, preFlightCaptcha.type);
          captchaSolved = 'YES';
          totalCaptchasSolved++;
          console.log('[CapSolver] Challenge solved successfully. Waiting for page redirect...');
          await sleep(3500);
        }
      }

      // Step D: Discover and Fill Contact Form
      const selectors = getSelectorsForUrl(lead.url);
      console.log('[FormFiller] Identifying form inputs...');
      const { filledFields, missingFields } = await fillContactForm(page, lead, selectors);

      const missingInquiryFields = validateInquiryFields({ filledFields }, lead);
      if (missingInquiryFields.length > 0) {
        throw new Error(`Inquiry form incomplete; refusing to submit. Missing: ${missingInquiryFields.join(', ')}.`);
      }

      console.log(`[FormFiller] Filled fields: [${filledFields.join(', ')}]. Missing: [${missingFields.join(', ')}]`);
      await sleep(2500);

      // Step E: CAPTCHA Inspection & Solving
      console.log('[CapSolver] Checking for CAPTCHA presence...');
      const captchaScan = await capSolver.detectCaptcha(page);

      if (captchaScan.detected) {
        console.log(`[CapSolver] CAPTCHA detected! Type: ${captchaScan.type}, Key: ${captchaScan.siteKey}`);

        if (!config.capsolver.apiKey || config.capsolver.apiKey.includes('YOUR_KEY')) {
          throw new Error('CAPTCHA detected on page but CAPSOLVER_API_KEY is not configured.');
        }

        const solveResult = await capSolver.solve({
          type: captchaScan.type,
          websiteURL: captchaScan.pageUrl || lead.url,
          websiteKey: captchaScan.siteKey,
          isInvisible: captchaScan.isInvisible || false,
        });

        if (solveResult.success && solveResult.token) {
          await capSolver.injectTokenAndTrigger(page, solveResult.token, captchaScan.type);
          captchaSolved = 'YES';
          totalCaptchasSolved++;
          console.log('[CapSolver] Solved token successfully injected.');
          await sleep(1500);
        } else {
          throw new Error('CapSolver completed without returning a valid token.');
        }
      } else {
        console.log('[CapSolver] No CAPTCHA detected on this page.');
        captchaSolved = 'NONE';
      }

      // Step F: Form Submission
      console.log('[FormFiller] Submitting contact inquiry...');
      const submitResult = await submitContactForm(page, selectors);

      if (submitResult.submitted) {
        runStatus = submitResult.confirmationDetected ? 'SUCCESS' : 'SUBMITTED_UNVERIFIED';
        runMessage = submitResult.message;
        if (submitResult.confirmationDetected) {
          successfulSubmissions++;
          console.log('[Success] Inquiry confirmed by the page.');
        } else {
          unverifiedSubmissions++;
          console.warn('[Unverified] Submit was clicked, but no confirmation was detected.');
        }

        // Capture photographic proof screenshot for client audit trail
        proofScreenshotPath = await captureErrorScreenshot(page, lead.url, submitResult.confirmationDetected ? 'proof_success' : 'proof_unverified');
        if (proofScreenshotPath) {
          console.log(`[Proof] Submission screenshot saved: ${proofScreenshotPath}`);
        }
      } else {
        runStatus = 'FAILED';
        runMessage = submitResult.message;
        failedSubmissions++;
        proofScreenshotPath = await captureErrorScreenshot(page, lead.url, 'submit_failed');
      }

    } catch (err) {
      runStatus = 'FAILED';
      runMessage = err.message;
      failedSubmissions++;
      console.error(`[Error] Processing failed for ${lead.url}: ${err.message}`);
      if (err.code === 'ACCESS_DENIED') {
        accessDenied = true;
        console.error('[Stop] The site blocked access or submission. Stopping the queue.');
      } else if (/is being used by .*not allowed to open/i.test(err.message)) {
        accessDenied = true;
        console.error('[Stop] AdsPower denied this profile to the current account. Resolve profile access before another run.');
      }

      if (page) {
        proofScreenshotPath = await captureErrorScreenshot(page, lead.url, 'error');
      }
    } finally {
      // Step G: Teardown and Cleanup for this iteration
      const durationSec = Math.round((Date.now() - startTime) / 1000);

      // Log result to CSV
      try {
        await logResult(config.files.outputResults, {
          url: lead.url,
          profileId: currentProfileId,
          status: runStatus,
          captchaSolved,
          name: lead.name,
          email: lead.email,
          durationSec,
          proofScreenshot: proofScreenshotPath || '',
          message: runMessage,
        });
      } catch (err) {
        persistenceFailed = true;
        process.exitCode = 1;
        console.error(`[DataManager] Failed to save result; stopping queue after cleanup: ${err.message}`);
      }
      processedCount++;

      // Step H: Real-time Webhook Notification (e.g. to n8n to update Google Sheet status)
      if (config.sender.webhookUrl) {
        try {
          await axios.post(config.sender.webhookUrl, {
            url: lead.url,
            status: runStatus,
            email: lead.email,
            name: lead.name,
            timestamp: new Date().toISOString(),
            captchaSolved,
            durationSec,
            proofScreenshot: proofScreenshotPath || '',
            message: runMessage,
          }, { timeout: 6000 });
          console.log('[Webhook] Real-time status update pushed to n8n / Google Sheet.');
        } catch (e) {
          console.warn(`[Webhook] Optional callback warning: ${e.message}`);
        }
      }

      // Disconnect Playwright
      if (playwrightBrowser) {
        await disconnectBrowser(playwrightBrowser).catch(() => {});
        activeBrowser = null;
      }

      // Stop AdsPower profile
      if (currentProfileId) {
        await adsClient.stopBrowser(currentProfileId).catch(() => {});
      }

      // Delay / Cooldown before next lead
      if (!accessDenied && !persistenceFailed && i < queue.length - 1) {
        const cooldownMs = randomBetween(config.delays.betweenLeadsMin, config.delays.betweenLeadsMax);
        console.log(`[Cooldown] Waiting ${(cooldownMs / 1000).toFixed(1)}s before launching next profile...`);
        await sleep(cooldownMs);
      }
    }
    if (accessDenied || persistenceFailed) break;
  }

  // Summary Report
  console.log('\n' + '='.repeat(70));
  console.log('                   AUTOMATION RUN COMPLETE                     ');
  console.log('='.repeat(70));
  console.log(`Total Leads Processed : ${processedCount}`);
  console.log(`Stopped on Denial     : ${accessDenied ? 'YES' : 'NO'}`);
  console.log(`Result Write Failed    : ${persistenceFailed ? 'YES' : 'NO'}`);
  console.log(`Profiles In Pool       : ${profilePool.length} (${profilePool.join(', ')})`);
  console.log(`Confirmed Inquiries    : ${successfulSubmissions}`);
  console.log(`Unverified Attempts    : ${unverifiedSubmissions}`);
  console.log(`Failed Inquiries       : ${failedSubmissions}`);
  console.log(`CAPTCHAs Solved        : ${totalCaptchasSolved}`);
  console.log(`Results File           : ${config.files.outputResults}`);
  console.log('='.repeat(70) + '\n');
  if (accessDenied || persistenceFailed) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[Fatal Error] Unhandled process exception:', err);
  cleanupOnExit(1);
});
