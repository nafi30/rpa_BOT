/**
 * Utility to pause execution for a set duration.
 * @param {number} ms
 */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Returns a random integer between min and max (inclusive).
 * @param {number} min
 * @param {number} max
 */
export const randomBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

/**
 * Fills a controlled input and lets the UI settle.
 * @param {import('playwright-core').Locator} locator
 * @param {string} text
 */
export async function humanType(locator, text) {
  await locator.scrollIntoViewIfNeeded();
  await sleep(randomBetween(150, 400));
  // Controlled inputs can rerender during typing and lose earlier keystrokes.
  await locator.fill(String(text));
  await locator.blur();
  await sleep(randomBetween(150, 300));
}

/**
 * Performs human-like scroll, hover, and click on a locator.
 * @param {import('playwright-core').Locator} locator
 */
export async function humanClick(locator) {
  await locator.scrollIntoViewIfNeeded();
  await sleep(randomBetween(300, 700));

  try {
    await locator.hover();
  } catch {
    // Hover may not always be supported on all custom elements, proceed to click
  }

  await sleep(randomBetween(200, 500));
  await locator.click();
  await sleep(randomBetween(400, 900));
}

/**
 * Low-level humanized press-and-hold interaction utility (10.5 seconds hold).
 * @param {import('playwright-core').Page} page
 * @param {string|import('playwright-core').Locator} selectorOrLocator
 * @param {number} [holdDurationMs=10500]
 */
export async function performPressAndHold(page, selectorOrLocator, holdDurationMs = 10500) {
  const locator = typeof selectorOrLocator === 'string' ? page.locator(selectorOrLocator).first() : selectorOrLocator;
  await locator.scrollIntoViewIfNeeded();
  await sleep(randomBetween(300, 600));

  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('Press-and-hold element is not visible or lacks bounding box.');
  }

  const targetX = box.x + box.width * (0.3 + Math.random() * 0.4);
  const targetY = box.y + box.height * (0.3 + Math.random() * 0.4);

  await page.mouse.move(targetX, targetY, { steps: 15 });
  await sleep(randomBetween(100, 300));

  await page.mouse.down();
  console.log(`[FormFiller] Mouse down pressed. Holding for ~${(holdDurationMs/1000).toFixed(1)} seconds...`);

  const startTime = Date.now();
  while (Date.now() - startTime < holdDurationMs) {
    const jitterX = targetX + (Math.random() - 0.5) * 2;
    const jitterY = targetY + (Math.random() - 0.5) * 2;
    await page.mouse.move(jitterX, jitterY);
    await page.waitForTimeout(100 + Math.random() * 100);
  }

  await page.mouse.up();
  console.log('[FormFiller] Mouse up released.');
  await sleep(randomBetween(500, 1000));
}

/**
 * Searches through a list of candidate selectors and returns the first visible & enabled locator.
 * @param {import('playwright-core').Page} page
 * @param {Array<string>} selectorCandidates
 * @returns {Promise<import('playwright-core').Locator|null>}
 */
export async function findFirstVisible(page, selectorCandidates = []) {
  for (const selector of selectorCandidates) {
    try {
      const matches = page.locator(selector);
      const count = await matches.count();
      for (let index = 0; index < count; index++) {
        const loc = matches.nth(index);
        if (!(await loc.isVisible())) continue;
        if (!(await loc.isEnabled().catch(() => true))) continue;
        await loc.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {});
        return loc;
      }
    } catch {
      // Continue to next candidate selector
    }
  }
  return null;
}

/**
 * Discovers and fills out the target contact form fields using configured or fallback selectors.
 * @param {import('playwright-core').Page} page
 * @param {Object} lead lead object
 * @param {Object} selectors selector schema
 * @returns {Promise<{ filledFields: Array<string>, missingFields: Array<string> }>}
 */
export async function fillContactForm(page, lead, selectors) {
  const filledFields = [];
  const missingFields = [];
  let messageText = lead.message || '';
  const eligibilityConfirmed = /^(true|yes)$/i.test(String(lead.eligiblefor55plus || ''));

  const listingTitle = await page.title?.().catch(() => '') || '';
  const listingUrl = page.url?.() || '';
  if ((/\b55\+\s*(?:active adult|community|housing)|senior housing/i.test(listingTitle) ||
      /55-active-adult/i.test(listingUrl)) && !eligibilityConfirmed) {
    const error = new Error('This is a 55+ housing listing; review occupant eligibility before inquiry.');
    error.code = 'ELIGIBILITY_REVIEW_REQUIRED';
    throw error;
  }

  const pageText = await page.locator('body').innerText().catch(() => '');
  if (/I confirm I meet the housing requirements for this listing/i.test(pageText) && !eligibilityConfirmed) {
    const error = new Error('Listing requires a housing-eligibility attestation; review and submit it manually if the intended occupant qualifies.');
    error.code = 'ELIGIBILITY_REVIEW_REQUIRED';
    throw error;
  }

  // Dismiss common cookie/privacy overlays
  try {
    const cookieBtn = await findFirstVisible(page, [
      'button:has-text("Accept All")',
      'button:has-text("Accept Cookies")',
      'button:has-text("Accept")',
      'button:has-text("Agree")',
      '#onetrust-accept-btn-handler',
    ]);
    if (cookieBtn) {
      console.log('[FormFiller] Dismissing cookie overlay banner...');
      await cookieBtn.click().catch(() => {});
      await sleep(600);
    }
  } catch {}

  const isFormAlreadyVisible = async () => {
    const n = await findFirstVisible(page, selectors.name || []);
    const fn = await findFirstVisible(page, selectors.firstName || []);
    const em = await findFirstVisible(page, selectors.email || []);
    return Boolean((n || fn) && em);
  };

  if (!(await isFormAlreadyVisible())) {
    console.log('[FormFiller] Form not immediately visible. Initiating autonomous trigger discovery...');
    let triggerBtn = null;

    if (selectors.modalTriggers && selectors.modalTriggers.length > 0) {
      triggerBtn = await findFirstVisible(page, selectors.modalTriggers);
    }

    if (!triggerBtn) {
      const candidates = [
        'button:has-text("Send Message")',
        'a:has-text("Send Message")',
        'button:has-text("Contact This Property")',
        'a:has-text("Contact This Property")',
        'button:has-text("Contact Property")',
        'a:has-text("Contact Property")',
        'button:has-text("Check Availability")',
        'button:has-text("Request Info")',
        'button:has-text("Inquire")',
        'button:has-text("Contact Us")',
        'a:has-text("Contact Us")',
      ];
      triggerBtn = await findFirstVisible(page, candidates);
    }

    if (triggerBtn) {
      console.log('[FormFiller] Found contact trigger button. Opening contact modal...');
      await humanClick(triggerBtn);
      await sleep(randomBetween(1500, 2500));
      await page.waitForSelector('#contactFormFirstName, #contactFormEmail, input[type="email"], input[name*="name" i]', { timeout: 7000 }).catch(() => {});
    } else {
      console.warn('[FormFiller] Warning: No explicit modal trigger button could be located.');
    }
  }

  const openedFormText = await page.locator('body').innerText().catch(() => '');
  if (/I confirm I meet the housing requirements for this listing/i.test(openedFormText)) {
    if (!eligibilityConfirmed) {
      const error = new Error('Listing requires a housing-eligibility attestation; review and submit it manually if the intended occupant qualifies.');
      error.code = 'ELIGIBILITY_REVIEW_REQUIRED';
      throw error;
    }
    const eligibilityBox = page.getByRole('checkbox', { name: /I confirm I meet the housing requirements for this listing/i });
    if (!(await eligibilityBox.count())) {
      const error = new Error('Eligibility confirmation was given, but the listing declaration checkbox could not be located.');
      error.code = 'ELIGIBILITY_REVIEW_REQUIRED';
      throw error;
    }
    if (!(await eligibilityBox.first().isChecked())) await eligibilityBox.first().check();
  }

  // 1. Conditional Options / Expander Handling
  const toggles = selectors.customMessageToggles || [
    '#custom-message',
    'input#custom-message',
    'label[for="custom-message"]',
    'label:has-text("Custom Message")',
    ':has-text("Custom Message") input[type="checkbox"]',
  ];
  try {
    for (const toggleSel of toggles) {
      const toggleLoc = page.locator(toggleSel).first();
      if ((await toggleLoc.count()) > 0 && (await toggleLoc.isVisible())) {
        const isChecked = await toggleLoc.isChecked().catch(() => false);
        if (!isChecked) {
          console.log(`[FormFiller] Expanding custom message section via toggle: "${toggleSel}"...`);
          await humanClick(toggleLoc);
          await sleep(randomBetween(600, 1000));
          break;
        }
      }
    }
  } catch (err) {
    console.warn(`[FormFiller] Custom message expander notice: ${err.message}`);
  }

  // 2. Name Handling
  let nameFilled = false;
  const firstNameLoc = await findFirstVisible(page, selectors.firstName || []);
  const lastNameLoc = await findFirstVisible(page, selectors.lastName || []);

  if (firstNameLoc || lastNameLoc) {
    const rawName = (lead.name || 'Hassam Abbas').trim();
    const parts = rawName.split(/\s+/);
    const firstName = parts[0] || 'Hassam';
    const lastName = parts.slice(1).join(' ') || 'Abbas';

    if (firstNameLoc) {
      console.log(`[FormFiller] Populating First Name input ("${firstName}")...`);
      await humanType(firstNameLoc, firstName);
      filledFields.push('firstName');
    }
    if (lastNameLoc) {
      console.log(`[FormFiller] Populating Last Name input ("${lastName}")...`);
      await humanType(lastNameLoc, lastName);
      filledFields.push('lastName');
    }
    nameFilled = true;
  } else {
    const singleNameLoc = await findFirstVisible(page, selectors.name || []);
    if (singleNameLoc) {
      console.log(`[FormFiller] Found single Full Name input. Populating ("${lead.name}")...`);
      await humanType(singleNameLoc, lead.name);
      filledFields.push('name');
      nameFilled = true;
    }
  }

  if (!nameFilled) {
    missingFields.push('name');
    console.warn('[FormFiller] Warning: No visible Name input matched.');
  }

  // 3. Email Handling
  const emailLoc = await findFirstVisible(page, selectors.email || []);
  if (emailLoc) {
    const isReadOnly = await emailLoc.getAttribute('readonly').then((value) => value !== null).catch(() => false);
    if (isReadOnly) {
      const authenticatedEmail = (await emailLoc.inputValue()).trim();
      if (authenticatedEmail.toLowerCase() !== (lead.email || '').trim().toLowerCase()) {
        const error = new Error(`HotPads profile is signed in as ${authenticatedEmail || '(blank)'}, but this lead requires ${lead.email || '(blank)'}. Use the matching profile or verify the intended alias first.`);
        error.code = 'AUTHENTICATED_EMAIL_MISMATCH';
        throw error;
      }
      console.log(`[FormFiller] Using verified HotPads account email: ${authenticatedEmail}.`);
    } else {
      console.log(`[FormFiller] Found Email input. Populating ("${lead.email}")...`);
      await humanType(emailLoc, lead.email);
    }
    filledFields.push('email');
  } else {
    missingFields.push('email');
    console.warn('[FormFiller] Warning: No visible Email input matched.');
  }

  // 4. Phone Handling
  if (lead.phone) {
    const phoneLoc = await findFirstVisible(page, selectors.phone || []);
    if (phoneLoc) {
      console.log(`[FormFiller] Found Phone input. Populating ("${lead.phone}")...`);
      await humanType(phoneLoc, lead.phone);
      filledFields.push('phone');
    }
  }

  // 5. Message / Inquiry Handling
  let messageLoc = await findFirstVisible(page, selectors.message || []);
  if (!messageLoc) {
    const customMsgLabel = page.locator('label:has-text("Custom Message"), #custom-message').first();
    if ((await customMsgLabel.count()) > 0) {
      await humanClick(customMsgLabel).catch(() => {});
      await sleep(600);
      messageLoc = await findFirstVisible(page, selectors.message || []);
    }
  }

  if (messageLoc) {
    if (messageText.length > 380) {
      console.log(`[FormFiller] Clamping message length from ${messageText.length} to 380 characters.`);
      messageText = messageText.slice(0, 380);
    }

    console.log('[FormFiller] Found Message textarea. Populating inquiry text...');
    await humanType(messageLoc, messageText);
    filledFields.push('message');
  } else {
    missingFields.push('message');
    console.warn('[FormFiller] Warning: No visible Message input matched.');
  }

  // 6. Consent Checkbox Handling
  try {
    const consentLoc = await findFirstVisible(page, selectors.consent || []);
    if (consentLoc) {
      const isChecked = await consentLoc.isChecked().catch(() => false);
      if (!isChecked) {
        console.log('[FormFiller] Checking required consent/terms box...');
        await humanClick(consentLoc);
        filledFields.push('consent');
      }
    }
  } catch (err) {
    console.warn(`[FormFiller] Consent checkbox check warning: ${err.message}`);
  }

  await assertNoBlockingChallenge(page);

  // Retain value checks
  const checks = [];
  if (filledFields.includes('firstName')) checks.push(['first name', selectors.firstName, (lead.name || '').trim().split(/\s+/)[0]]);
  if (filledFields.includes('lastName')) checks.push(['last name', selectors.lastName, (lead.name || '').trim().split(/\s+/).slice(1).join(' ') || 'Abbas']);
  if (filledFields.includes('name')) checks.push(['name', selectors.name, lead.name]);
  if (filledFields.includes('email')) checks.push(['email', selectors.email, lead.email]);
  if (filledFields.includes('phone')) checks.push(['phone', selectors.phone, lead.phone]);
  if (filledFields.includes('message')) checks.push(['message', selectors.message, messageText]);

  for (const [field, candidates, expected] of checks) {
    const matches = (actual) => field === 'phone'
      ? actual.replace(/\D/g, '') === String(expected).replace(/\D/g, '')
      : field === 'email'
        ? actual.trim().toLowerCase() === String(expected).trim().toLowerCase()
        : actual.trim() === String(expected).trim();
    let locator = await findFirstVisible(page, candidates || []);
    let actual = locator ? await locator.inputValue().catch(() => '') : '';
    if (!matches(actual) && locator) {
      console.warn(`[FormFiller] ${field} did not retain its value; refilling once.`);
      await humanType(locator, expected);
      locator = await findFirstVisible(page, candidates || []);
      actual = locator ? await locator.inputValue().catch(() => '') : '';
    }
    if (!matches(actual)) {
      throw new Error(`Inquiry ${field} value did not persist; refusing to submit.`);
    }
  }

  return { filledFields, missingFields };
}

/**
 * Prevents a generic submit button from sending a different form.
 */
export function validateInquiryFields({ filledFields }, lead) {
  const missing = [];
  if (!filledFields.includes('name') && !filledFields.includes('firstName')) missing.push('name');
  if (!filledFields.includes('email') || !lead.email?.trim()) missing.push('email');
  if (!filledFields.includes('message') || !lead.message?.trim()) missing.push('message');
  return missing;
}

/**
 * Detects whether an active PerimeterX / HotPads challenge is present.
 * @param {import('playwright-core').Page} page
 */
export async function isChallengePresent(page) {
  try {
    const indicators = [
      '#px-captcha',
      '#px-captcha-wrapper',
      '.px-captcha-container',
      'iframe#px-captcha-modal',
      'iframe[src*="captcha"]',
    ];
    for (const sel of indicators) {
      const loc = page.locator(sel).first();
      if ((await loc.count().catch(() => 0)) > 0 && (await loc.isVisible().catch(() => false))) {
        return true;
      }
    }
    const pageText = await page.locator('body').innerText().catch(() => '');
    if (/press\s*(?:&|and)\s*hold to confirm you are/i.test(pageText)) {
      return true;
    }
  } catch {}
  return false;
}

/**
 * Searches across all page frames and the top document for the interactive Press & Hold button.
 * @param {import('playwright-core').Page} page
 */
export async function findPressAndHoldInteractiveButton(page) {
  const candidateSelectors = [
    'div[role="button"][aria-label*="Press & Hold" i]',
    'div[role="button"]:has-text("Press & Hold")',
    'button[aria-label*="Press & Hold" i]',
    'button:has-text("Press & Hold")',
    'div[aria-label="Press & Hold"]',
  ];

  const frames = typeof page.frames === 'function' ? page.frames() : [];
  for (const frame of frames) {
    for (const sel of candidateSelectors) {
      try {
        const loc = frame.locator(sel).first();
        if ((await loc.count().catch(() => 0)) > 0 && (await loc.isVisible().catch(() => false))) {
          const box = await loc.boundingBox().catch(() => null);
          if (box && box.width > 20 && box.height > 20) {
            return { locator: loc, box, frame };
          }
        }
      } catch {}
    }
  }

  for (const sel of candidateSelectors) {
    try {
      const loc = page.locator(sel).first();
      if ((await loc.count().catch(() => 0)) > 0 && (await loc.isVisible().catch(() => false))) {
        const box = await loc.boundingBox().catch(() => null);
        if (box && box.width > 20 && box.height > 20) {
          return { locator: loc, box, frame: null };
        }
      }
    } catch {}
  }

  return null;
}

/** Detect and attempt to solve press-and-hold challenges or stop cleanly when blocked. */
export async function assertNoBlockingChallenge(page) {
  const challengeDetected = await isChallengePresent(page);
  const overlay = page.locator('iframe#px-captcha-modal');
  const overlayVisible = (await overlay.count().catch(() => 0)) > 0 && (await overlay.first().isVisible().catch(() => false));

  if (!challengeDetected && !overlayVisible) {
    return;
  }

  // Target the real interactive button inside frame or DOM
  const buttonInfo = await findPressAndHoldInteractiveButton(page);
  if (buttonInfo) {
    console.log('[FormFiller] Detected Press & Hold verification challenge. Attempting autonomous humanized 10.5s hold on interactive element...');
    try {
      await performPressAndHold(page, buttonInfo.locator, 10500);
      await sleep(3000);
    } catch (err) {
      console.warn(`[FormFiller] Autonomous press-and-hold interaction error: ${err.message}`);
    }
  } else {
    console.warn('[FormFiller] Challenge overlay detected, but interactive hold button could not be targeted.');
  }

  // Verify whether the challenge was actually cleared
  const stillBlocked = (await isChallengePresent(page)) ||
    ((await overlay.count().catch(() => 0)) > 0 && (await overlay.first().isVisible().catch(() => false)));

  if (stillBlocked) {
    const error = new Error('HotPads verification challenge is blocking submission; manual verification or platform-authorized access is required.');
    error.code = 'ACCESS_DENIED';
    throw error;
  }

  console.log('[FormFiller] Challenge successfully cleared. Proceeding with form...');
}

/** Detect the verification error shown after HotPads receives a form click. */
export async function assertNoVerificationFailure(page) {
  const postClickText = await page.locator('body').innerText().catch(() => '');
  if (/couldn['’]t send your verification code|could not send your verification code|unable to send your verification code/i.test(postClickText)) {
    const error = new Error('HotPads could not send the required verification code; inquiry was not delivered.');
    error.code = 'VERIFICATION_FAILED';
    throw error;
  }
}

async function verificationPromptVisible(page) {
  const text = await page.locator('body').innerText().catch(() => '');
  return /(?:we sent a verification code|enter (?:your|the) (?:verification|one.time) code|sign in to contact property)/i.test(text);
}

/** Enter the emailed code into HotPads' six-digit sign-in dialog. */
export async function enterHotPadsVerificationCode(page, code) {
  if (!/^\d{6}$/.test(code)) throw new Error('HotPads verification code must contain six digits.');
  const candidates = page.locator('input[autocomplete="one-time-code"], input[inputmode="numeric"], input[maxlength="1"]');
  const visible = [];
  for (let i = 0; i < await candidates.count(); i++) {
    const candidate = candidates.nth(i);
    if (await candidate.isVisible()) visible.push(candidate);
  }
  if (visible.length >= 6) {
    for (let i = 0; i < 6; i++) await visible[i].fill(code[i]);
  } else if (visible.length === 1) {
    await visible[0].fill(code);
  } else {
    const error = new Error('HotPads code inputs could not be located; inquiry remains unverified.');
    error.code = 'VERIFICATION_REQUIRED';
    throw error;
  }
  const continueButton = page.getByRole('button', { name: /^Continue$/i });
  if (!(await continueButton.count()) || !(await continueButton.first().isEnabled())) {
    const error = new Error('HotPads Continue button is unavailable after entering the code.');
    error.code = 'VERIFICATION_REQUIRED';
    throw error;
  }
  await continueButton.first().click();
}

/**
 * Locates and submits the contact form, then monitors for confirmation.
 * @param {import('playwright-core').Page} page
 * @param {Object} selectors
 * @returns {Promise<{ submitted: boolean, confirmationDetected: boolean, message: string }>}
 */
export async function submitContactForm(page, selectors, verification = null) {
  await assertNoBlockingChallenge(page);
  const submitBtn = await findFirstVisible(page, selectors.submit || []);

  if (!submitBtn) {
    return {
      submitted: false,
      confirmationDetected: false,
      message: 'Submit button could not be located on the page.',
    };
  }

  const successIndicators = [...(selectors.successIndicators || [])];
  if (page.url().includes('hotpads.com')) successIndicators.push('button:has-text("Contact again?")');
  const beforeSubmit = new Map();
  for (const indicator of successIndicators) {
    try {
      const el = page.locator(indicator).first();
      if ((await el.count()) > 0 && (await el.isVisible())) {
        beforeSubmit.set(indicator, await el.innerText().catch(() => ''));
      }
    } catch {
      // Continue check
    }
  }

  await assertNoBlockingChallenge(page);
  console.log('[FormFiller] Located submit button. Triggering click...');
  const codeRequestedAfter = Date.now();
  try {
    await humanClick(submitBtn);
  } catch (error) {
    await assertNoBlockingChallenge(page);
    throw error;
  }

  await sleep(randomBetween(2500, 4500));

  await assertNoVerificationFailure(page);
  if (await verificationPromptVisible(page)) {
    if (!verification?.waitForCode || !verification.recipient) {
      const error = new Error('HotPads requested an email code, but Zoho verification is not configured.');
      error.code = 'VERIFICATION_REQUIRED';
      throw error;
    }
    console.log(`[Verification] Waiting for HotPads email to ${verification.recipient}...`);
    const code = await verification.waitForCode(verification.recipient, codeRequestedAfter);
    await enterHotPadsVerificationCode(page, code);
    await sleep(2500);
    await assertNoVerificationFailure(page);
  }

  let confirmationDetected = false;
  const confirmationDeadline = Date.now() + 15000;
  do {
    for (const indicator of successIndicators) {
      try {
        const el = page.locator(indicator).first();
        if ((await el.count()) > 0 && (await el.isVisible())) {
          const currentText = await el.innerText().catch(() => '');
          if (!beforeSubmit.has(indicator) || currentText !== beforeSubmit.get(indicator)) {
            confirmationDetected = true;
            console.log(`[FormFiller] Confirmation indicator detected: "${indicator}"`);
            break;
          }
        }
      } catch {
        // Continue check
      }
    }
    if (!confirmationDetected && Date.now() < confirmationDeadline) await sleep(500);
  } while (!confirmationDetected && Date.now() < confirmationDeadline);

  return {
    submitted: true,
    confirmationDetected,
    message: confirmationDetected ? 'Form submitted and confirmed successfully.' : 'Form submitted (no explicit confirmation banner detected).',
  };
}

export default {
  sleep,
  randomBetween,
  humanType,
  humanClick,
  performPressAndHold,
  findFirstVisible,
  fillContactForm,
  validateInquiryFields,
  submitContactForm,
};