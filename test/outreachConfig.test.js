import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../config.js';
import { generateMessage } from '../lib/spintaxEngine.js';
import { selectProfileIndex, selectSenderEmail } from '../lib/rotation.js';

test('blank messages use the single corporate lease first outreach from the deck', () => {
  const actual = generateMessage({ leadName: 'Hassam Abbas' });
  assert.equal(actual,
    'Hello,\n\n' +
    'We are interested in leasing multiple units there for 12 months, if you are not opposed to corporate leases?\n\n' +
    `Regards,\nHassam Abbas\n${config.sender.defaultCompany}`);
  assert.equal(generateMessage({ leadName: 'Hassam Abbas' }), actual);
  assert.equal(generateMessage({ rawMessage: 'Custom approved text', leadName: 'Hassam Abbas' }), 'Custom approved text');
});

test('eight inboxes rotate by original sheet position across resumed runs', () => {
  const inboxes = Array.from({ length: 8 }, (_, i) => `sender${i}@example.com`);
  assert.deepEqual(Array.from({ length: 16 }, (_, i) => selectSenderEmail(i, inboxes)), [...inboxes, ...inboxes]);
  assert.equal(selectSenderEmail(9, inboxes), inboxes[1]);
  assert.equal(selectProfileIndex(9, 5, 'round-robin', 20), 4);
  assert.equal(selectProfileIndex(9, 5, 'batch', 20), 0);
  assert.equal(selectProfileIndex(20, 5, 'batch', 20), 1);
});
