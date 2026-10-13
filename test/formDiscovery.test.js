import test from 'node:test';
import assert from 'node:assert/strict';
import { findFirstVisible, validateInquiryFields } from '../lib/formFiller.js';

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
