import { execSync } from 'child_process';
import axios from 'axios';
import { config, validateConfig } from './config.js';
import { AdsPowerClient } from './lib/adspower.js';
import { CapSolverClient } from './lib/capsolver.js';
import { connectToAdsPower, safeNavigate, captureErrorScreenshot, disconnectBrowser } from './lib/browser.js';
import { fillContactForm, submitContactForm, sleep, randomBetween } from './lib/formFiller.js';
import { getSelectorsForUrl } from './selectors.config.js';
import { loadLeads, getProcessedUrls, logResult } from './lib/dataManager.js';
import { generateMessage } from './lib/spintaxEngine.js';

function ensureXvfbEnvironment() {
  if (process.platform === 'linux') {
    try {
      const isXvfbRunning = execSync('pgrep -f "Xvfb :99" || true').toString().trim();
      if (!isXvfbRunning) {
        console.log('[Display] Initializing Xvfb virtual display on :99 (1920x1080)...');
        execSync('which Xvfb > /dev/null || (apt-get update && apt-get install -y xvfb)');
        execSync('nohup Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp > /dev/null 2>&1 &');
      }
      process.env.DISPLAY = process.env.DISPLAY || ':99';
      console.log(`[Display] Active DISPLAY set to: ${process.env.DISPLAY}`);
    } catch (err) {
      console.warn(`[Display] Virtual screen init note: ${err.message}`);
    }
  }
}

// Global reference for clean shutdown
let activeBrowser = null;
let currentProfileId = null;
let adsClient = null;

// Graceful exit handlers
async function cleanupOnExit() {
  console.log('\n[Shutdown] Cleaning up active sessions before exit...');
  if (activeBrowser) {
    await disconnectBrowser(activeBrowser).catch(() => {});
  }
  if (adsClient && currentProfileId) {
    await adsClient.stopBrowser(currentProfileId).catch(() => {});
  }
  process.exit(0);
}

process.on('SIGINT', cleanupOnExit);
process.on('SIGTERM', cleanupOnExit);

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

  // 2. Ingest Leads
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

  // 3. Deduplication Check (Only skip successfully submitted leads)
  const processedUrls = getProcessedUrls(config.files.outputResults, { onlySuccessful: true });
  const queue = leads.filter((lead) => !processedUrls.has(lead.url));
  console.log(`[DataManager] ${processedUrls.size} previously successful lead(s) skipped.`);
  console.log(`[DataManager] ${queue.length} lead(s) ready in active queue.`);

  if (queue.length === 0) {
    console.log('[DataManager] All leads have already been processed. Nothing to do!');
    return;
  }

  // Resolve Profile Pool
  const profilePool = config.adspower.profilePool.length > 0
    ? config.adspower.profilePool
    : [config.adspower.profileId || config.adspower.serialNumber];

  console.log(`\n[Rotation] Profile Pool: ${profilePool.length} profile(s) [${profilePool.join(', ')}]`);
  console.log(`[Rotation] Strategy: ${config.adspower.rotationStrategy.toUpperCase()}${config.adspower.rotationStrategy === 'batch' ? ` (${config.adspower.leadsPerProfile} leads/profile)` : ''}`);

  // 4. Execution Loop
  let successfulSubmissions = 0;
  let failedSubmissions = 0;
  let totalCaptchasSolved = 0;
  let accessDenied = false;
  let processedCount = 0;

  for (let i = 0; i < queue.length; i++) {
    const lead = queue[i];
    const leadIndex = i + 1;
    const startTime = Date.now();

    // Select profile according to configured strategy
    let profileIndex = 0;
    if (config.adspower.rotationStrategy === 'round-robin') {
      profileIndex = i % profilePool.length;
    } else {
      // 'batch': switches profile every LEADS_PER_PROFILE
      profileIndex = Math.floor(i / config.adspower.leadsPerProfile) % profilePool.length;
    }
    currentProfileId = profilePool[profileIndex];

    // Resolve sender identity (Henry's email rotation pool & defaults)
    if (!lead.email && config.sender.emails.length > 0) {
      const emailIndex = i % config.sender.emails.length;
      lead.email = config.sender.emails[emailIndex];
    }
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

    // Dynamically resolve Spintax message variation for anti-spam safety
    lead.message = generateMessage({
      rawMessage: lead.message,
      leadName: lead.name,
    });
    console.log(`[Spintax] Resolved Inquiry Message: "${lead.message.slice(0, 90)}..."`);
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

      if (filledFields.length === 0) {
        throw new Error(`Could not locate any valid form input fields matching target selectors.`);
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
        successfulSubmissions++;
        console.log(`[Success] Inquiry processed successfully (${runStatus}).`);

        // Capture photographic proof screenshot for client audit trail
        proofScreenshotPath = await captureErrorScreenshot(page, lead.url, 'proof_success');
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
        console.error('[Stop] Target denied page access. Stopping this run to avoid repeating the same failure across the queue.');
      }

      if (page) {
        proofScreenshotPath = await captureErrorScreenshot(page, lead.url, 'error');
      }
    } finally {
      // Step G: Teardown and Cleanup for this iteration
      const durationSec = Math.round((Date.now() - startTime) / 1000);

      // Log result to CSV
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
      if (!accessDenied && i < queue.length - 1) {
        const cooldownMs = randomBetween(config.delays.betweenLeadsMin, config.delays.betweenLeadsMax);
        console.log(`[Cooldown] Waiting ${(cooldownMs / 1000).toFixed(1)}s before launching next profile...`);
        await sleep(cooldownMs);
      }
    }
    if (accessDenied) break;
  }

  // Summary Report
  console.log('\n' + '='.repeat(70));
  console.log('                   AUTOMATION RUN COMPLETE                     ');
  console.log('='.repeat(70));
  console.log(`Total Leads Processed : ${processedCount}`);
  console.log(`Stopped on Denial     : ${accessDenied ? 'YES' : 'NO'}`);
  console.log(`Profiles In Pool       : ${profilePool.length} (${profilePool.join(', ')})`);
  console.log(`Successful Inquiries   : ${successfulSubmissions}`);
  console.log(`Failed Inquiries       : ${failedSubmissions}`);
  console.log(`CAPTCHAs Solved        : ${totalCaptchasSolved}`);
  console.log(`Results File           : ${config.files.outputResults}`);
  console.log('='.repeat(70) + '\n');
}

main().catch((err) => {
  console.error('[Fatal Error] Unhandled process exception:', err);
  cleanupOnExit();
});
