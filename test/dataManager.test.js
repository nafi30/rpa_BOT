import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getProcessedUrls, logResult } from '../lib/dataManager.js';

function withResultsFile(content, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpa-results-'));
  const file = path.join(dir, 'results.csv');
  if (content !== null) fs.writeFileSync(file, content);
  return Promise.resolve().then(() => run(file)).finally(() => fs.rmSync(dir, { recursive: true, force: true }));
}

test('reads legacy results with quoted commas and statuses by header name', () =>
  withResultsFile(
    'URL,STATUS,CAPTCHA_SOLVED,NAME,EMAIL,DURATION_SEC,TIMESTAMP,MESSAGE\n' +
    '"https://example.com/a,b",SUCCESS,N/A,A,a@example.com,1,2026-01-01,"ok, confirmed"\n' +
    'https://example.com/failed,FAILED,N/A,A,a@example.com,1,2026-01-01,error\n',
    async (file) => {
      const processed = await getProcessedUrls(file);
      assert.deepEqual([...processed], ['https://example.com/a,b']);
      assert.equal((await getProcessedUrls(file, { onlySuccessful: false })).size, 2);
    },
  ));

test('reads current results and retains unverified submissions to avoid duplicate sends', () =>
  withResultsFile(
    'URL,PROFILE_ID,STATUS,CAPTCHA_SOLVED,NAME,EMAIL,DURATION_SEC,TIMESTAMP,PROOF_SCREENSHOT,MESSAGE\n' +
    'https://example.com/one,p1,SUBMITTED_UNVERIFIED,N/A,A,a@example.com,1,2026-01-01,,sent\n',
    async (file) => assert.deepEqual([...await getProcessedUrls(file)], ['https://example.com/one']),
  ));

test('appends legacy result using its original column order', () =>
  withResultsFile(
    'URL,STATUS,CAPTCHA_SOLVED,NAME,EMAIL,DURATION_SEC,TIMESTAMP,MESSAGE\n',
    async (file) => {
      await logResult(file, { url: 'https://example.com/two', profileId: 'p1', status: 'SUCCESS', message: 'ok' });
      const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
      assert.equal(lines.length, 2);
      assert.match(lines[1], /^https:\/\/example\.com\/two,SUCCESS,/);
    },
  ));

test('rejects unknown results header before appending', () =>
  withResultsFile('OTHER,VALUE\n', async (file) => {
    await assert.rejects(getProcessedUrls(file), /missing URL or STATUS/);
    await assert.rejects(logResult(file, { url: 'https://example.com' }), /Unrecognized results CSV header/);
    assert.equal(fs.readFileSync(file, 'utf8'), 'OTHER,VALUE\n');
  }));
