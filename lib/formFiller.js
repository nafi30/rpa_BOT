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
 * @param {Object} lead - Normalized lead object
 * @param {Object} selectors - Active selector schema
 * @returns {Promise<{ filledFields: Array<string>, missingFields: Array<string> }>}
 */
export async function fillContactForm(page, lead, selectors) {
  const filledFields = [];
  const missingFields = [];
  let messageText = lead.message || '';

  // Some listings require a claim about the occupant's eligibility (such as 55+ housing).
  // Never treat that claim as a generic terms/consent checkbox.
  const pageText = await page.locator('body').innerText().catch(() => '');
  if (/I confirm I meet the housing requirements for this listing/i.test(pageText)) {
    const error = new Error('Listing requires a housing-eligibility attestation; review and submit it manually if the intended occupant qualifies.');
    error.code = 'ELIGIBILITY_REVIEW_REQUIRED';
    throw error;
  }

  // Dismiss common cookie/privacy overlays that may obscure the form
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

  // 0. Modal / Overlay Discovery: If form is gated behind a button/drawer, open it
  const isFormAlreadyVisible = async () => {
    const n = await findFirstVisible(page, selectors.name || []);
    const fn = await findFirstVisible(page, selectors.firstName || []);
    const em = await findFirstVisible(page, selectors.email || []);
    return Boolean((n || fn) && em);
  };

  if (!(await isFormAlreadyVisible())) {
    console.log('[FormFiller] Form not immediately visible. Initiating autonomous trigger discovery...');
    let triggerBtn = null;

    // A. Check domain-specific and default configured triggers
    if (selectors.modalTriggers && selectors.modalTriggers.length > 0) {
      triggerBtn = await findFirstVisible(page, selectors.modalTriggers);
    }

    // B. Broad semantic fallback: search for standard contact / inquiry action buttons
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

    // C. Click trigger button to summon modal
    if (triggerBtn) {
      console.log('[FormFiller] Found contact trigger button. Opening contact modal...');
      await humanClick(triggerBtn);
      await sleep(randomBetween(1500, 2500));
      // Wait for modal inputs to attach to DOM and become visible
      await page.waitForSelector('#contactFormFirstName, #contactFormEmail, input[type="email"], input[name*="name" i]', { timeout: 7000 }).catch(() => {});
    } else {
      console.warn('[FormFiller] Warning: No explicit modal trigger button could be located.');
    }
  }

  // Some eligibility statements appear only after opening the inquiry form.
  const openedFormText = await page.locator('body').innerText().catch(() => '');
  if (/I confirm I meet the housing requirements for this listing/i.test(openedFormText)) {
    const error = new Error('Listing requires a housing-eligibility attestation; review and submit it manually if the intended occupant qualifies.');
    error.code = 'ELIGIBILITY_REVIEW_REQUIRED';
    throw error;
  }

  // 1. Conditional Options / Expander Handling (e.g. Apartments.com "Custom Message" checkbox)
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

  // 2. Name Handling (Full Name vs First / Last Name split)
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
    // Attempt single Full Name input
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
    console.log(`[FormFiller] Found Email input. Populating ("${lead.email}")...`);
    await humanType(emailLoc, lead.email);
    filledFields.push('email');
  } else {
    missingFields.push('email');
    console.warn('[FormFiller] Warning: No visible Email input matched.');
  }

  // 4. Phone Handling (Optional)
  if (lead.phone) {
    const phoneLoc = await findFirstVisible(page, selectors.phone || []);
    if (phoneLoc) {
      console.log(`[FormFiller] Found Phone input. Populating ("${lead.phone}")...`);
      await humanType(phoneLoc, lead.phone);
      filledFields.push('phone');
    }
  }

  // 5. Message / Inquiry Handling
  // If message input was not visible earlier, re-verify custom message expander
  let messageLoc = await findFirstVisible(page, selectors.message || []);
  if (!messageLoc) {
    // Retry clicking custom-message label if textarea still isn't visible
    const customMsgLabel = page.locator('label:has-text("Custom Message"), #custom-message').first();
    if ((await customMsgLabel.count()) > 0) {
      await humanClick(customMsgLabel).catch(() => {});
      await sleep(600);
      messageLoc = await findFirstVisible(page, selectors.message || []);
    }
  }

  if (messageLoc) {
    // Clamp message length to 380 chars to respect portal restrictions (e.g. Apartments.com 400-char max)
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

  // 6. Consent Checkbox Handling (Check if required and unchecked)
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

  // Confirm the page retained every value; a located field alone is insufficient.
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

/** Stop when HotPads displays its site verification overlay over the form. */
export async function assertNoBlockingChallenge(page) {
  const overlay = page.locator('iframe#px-captcha-modal');
  if ((await overlay.count()) > 0 && (await overlay.first().isVisible())) {
    const error = new Error('HotPads verification challenge is blocking submission; manual verification or platform-authorized access is required.');
    error.code = 'ACCESS_DENIED';
    throw error;
  }
}

/**
 * Locates and submits the contact form, then monitors for confirmation.
 * @param {import('playwright-core').Page} page
 * @param {Object} selectors
 * @returns {Promise<{ submitted: boolean, confirmationDetected: boolean, message: string }>}
 */
export async function submitContactForm(page, selectors) {
  await assertNoBlockingChallenge(page);
  const submitBtn = await findFirstVisible(page, selectors.submit || []);

  if (!submitBtn) {
    return {
      submitted: false,
      confirmationDetected: false,
      message: 'Submit button could not be located on the page.',
    };
  }

  // Record existing success text so a static page banner is not mistaken
  // for confirmation of this particular submission.
  const beforeSubmit = new Map();
  for (const indicator of selectors.successIndicators || []) {
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
  try {
    await humanClick(submitBtn);
  } catch (error) {
    await assertNoBlockingChallenge(page);
    throw error;
  }

  // Allow time for async AJAX submission or redirect
  await sleep(randomBetween(2500, 4500));

  // Check for a new or changed success indicator.
  let confirmationDetected = false;
  for (const indicator of selectors.successIndicators || []) {
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
  findFirstVisible,
  fillContactForm,
  validateInquiryFields,
  submitContactForm,
};
