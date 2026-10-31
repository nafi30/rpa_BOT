import test from 'node:test';
import assert from 'node:assert/strict';
import { getSelectorsForUrl } from '../selectors.config.js';
import { findFirstVisible, validateInquiryFields, assertNoBlockingChallenge, assertNoVerificationFailure, enterHotPadsVerificationCode, fillContactForm } from '../lib/formFiller.js';

test('finds a visible enabled control after a hidden duplicate', async () => {
  const hidden = {
    isVisible: async () => false,
    isEnabled: async () => true,
    scrollIntoViewIfNeeded: async () => {},
  };
  const visible = {
    isVisible: async () => true,
    isEnabled: async () => true,
    scrollIntoViewIfNeeded: async () => {},
  };
  const page = {
    locator: () => ({
      count: async () => 2,
      nth: (index) => [hidden, visible][index],
    }),
  };
  assert.equal(await findFirstVisible(page, ['button.contact']), visible);
});

test('skips disabled controls and checks the next selector', async () => {
  const disabled = {
    isVisible: async () => true,
    isEnabled: async () => false,
    scrollIntoViewIfNeeded: async () => {},
  };
  const enabled = {
    isVisible: async () => true,
    isEnabled: async () => true,
    scrollIntoViewIfNeeded: async () => {},
  };
  const page = {
    locator: (selector) => ({
      count: async () => 1,
      nth: () => selector === 'button.disabled' ? disabled : enabled,
    }),
  };
  assert.equal(await findFirstVisible(page, ['button.disabled', 'button.enabled']), enabled);
});

test('inquiry requires name, email, and message before any submit click', () => {
  const lead = { email: 'person@example.com', message: 'Is the property available?' };
  assert.deepEqual(validateInquiryFields({ filledFields: ['firstName', 'email', 'message'] }, lead), []);
  assert.deepEqual(validateInquiryFields({ filledFields: ['firstName', 'email'] }, lead), ['message']);
  assert.deepEqual(validateInquiryFields({ filledFields: ['email', 'message'] }, lead), ['name']);
  assert.deepEqual(validateInquiryFields({ filledFields: ['name', 'email', 'message'] }, { ...lead, email: '' }), ['email']);
});


test('visible HotPads verification overlay stops submission before a blocked click', async () => {
  const page = {
    locator: () => ({
      count: async () => 1,
      first: () => ({ isVisible: async () => true }),
    }),
  };
  await assert.rejects(assertNoBlockingChallenge(page), (error) =>
    error.code === 'ACCESS_DENIED' && /verification challenge/.test(error.message));
});


test('age-restricted housing declaration is never treated as generic consent', async () => {
  const page = { locator: () => ({ innerText: async () => 'I confirm I meet the housing requirements for this listing.' }) };
  await assert.rejects(fillContactForm(page, {}, {}), (error) =>
    error.code === 'ELIGIBILITY_REVIEW_REQUIRED');
});


test('HotPads verification-code error is never counted as delivery', async () => {
  const page = { locator: () => ({ innerText: async () => "We couldn't send your verification code. Please try again." }) };
  await assert.rejects(assertNoVerificationFailure(page), (error) =>
    error.code === 'VERIFICATION_FAILED' && /not delivered/.test(error.message));
  const selectors = getSelectorsForUrl('https://hotpads.com/example/pad');
  assert.equal(selectors.successIndicators.some((selector) => selector.includes('has-text("Success")')), false);
});

test('HotPads six-digit code is entered in order before Continue', async () => {
  const entered = [];
  let continued = false;
  const inputs = Array.from({ length: 6 }, (_, index) => ({
    isVisible: async () => true,
    fill: async (digit) => { entered[index] = digit; },
  }));
  const page = {
    locator: () => ({ count: async () => inputs.length, nth: (index) => inputs[index] }),
    getByRole: () => ({ count: async () => 1, first: () => ({
      isEnabled: async () => entered.join('').length === 6,
      click: async () => { continued = true; },
    }) }),
  };
  await enterHotPadsVerificationCode(page, '123456');
  assert.deepEqual(entered, ['1', '2', '3', '4', '5', '6']);
  assert.equal(continued, true);
});

test('read-only signed-in email must match the intended alias', async () => {
  const email = {
    getAttribute: async () => '',
    inputValue: async () => 'hassam.0@safestay.online',
  };
  const page = {
    title: async () => 'Gables Ponce',
    url: () => 'https://hotpads.com/gables-ponce/pad',
    locator: () => ({ innerText: async () => '', count: async () => 0 }),
  };
  const { fillContactForm } = await import('../lib/formFiller.js');
  // Keep this test focused on the mismatch guard; the other fields are irrelevant.
  const selectors = { email: ['#email'] };
  page.locator = (selector) => selector === '#email'
    ? ({ count: async () => 1, nth: () => ({ ...email, isVisible: async () => true, isEnabled: async () => true, scrollIntoViewIfNeeded: async () => {} }) })
    : ({ innerText: async () => '', count: async () => 0 });
  await assert.rejects(fillContactForm(page, { name: 'Hassam Abbas', email: 'other@safestay.online', message: 'Hello' }, selectors),
    (error) => error.code === 'AUTHENTICATED_EMAIL_MISMATCH');
});

test('55+ listing requires human eligibility review even if the checkbox is hidden', async () => {
  const page = {
    title: async () => 'Overture Doral - 55+ Active Adult Homes',
    url: () => 'https://hotpads.com/overture-doral-55-active-adult-homes/pad',
  };
  await assert.rejects(fillContactForm(page, {}, {}), (error) =>
    error.code === 'ELIGIBILITY_REVIEW_REQUIRED');
});
