import fs from 'fs';
import path from 'path';
import csvParser from 'csv-parser';
import { createObjectCsvWriter } from 'csv-writer';

/**
 * Normalizes property keys of an object to lowercase and removes special characters.
 * @param {Object} rawLead
 * @returns {Object} Normalized lead object
 */
export function normalizeLead(rawLead) {
  const normalized = {};

  for (const [key, value] of Object.entries(rawLead)) {
    const cleanKey = key.trim().toLowerCase().replace(/[\s_-]+/g, '');
    const cleanVal = typeof value === 'string' ? value.trim() : (value || '');

    if (['url', 'listingurl', 'link', 'propertyurl', 'targeturl'].includes(cleanKey)) {
      normalized.url = cleanVal;
    } else if (['name', 'fullname', 'contactname', 'clientname'].includes(cleanKey)) {
      normalized.name = cleanVal;
    } else if (['email', 'contactemail', 'mail'].includes(cleanKey)) {
      normalized.email = cleanVal;
    } else if (['phone', 'phonenumber', 'tel', 'mobile', 'cell'].includes(cleanKey)) {
      normalized.phone = cleanVal;
    } else if (['message', 'inquiry', 'msg', 'comment', 'notes', 'body'].includes(cleanKey)) {
      normalized.message = cleanVal;
    } else {
      normalized[cleanKey] = cleanVal;
    }
  }

  // Ensure default expected keys exist
  normalized.url = normalized.url || '';
  normalized.name = normalized.name || 'Interested Buyer';
  normalized.email = normalized.email || '';
  normalized.phone = normalized.phone || '';
  normalized.message = normalized.message || '';

  return normalized;
}

/**
 * Restricts production outreach to explicitly configured listing domains.
 */
export function isAllowedLeadUrl(value, allowedDomains) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    const hostname = url.hostname.toLowerCase();
    return allowedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

/**
 * Loads and parses leads from either CSV or JSON file.
 * @param {string} filePath
 * @returns {Promise<Array<Object>>}
 */
export async function loadLeads(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Leads input file not found at: ${filePath}`);
  }

  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.json') {
    const rawData = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(rawData);
    const list = Array.isArray(parsed) ? parsed : (parsed.leads || []);
    return list.map(normalizeLead).filter(lead => lead.url);
  }

  if (ext === '.csv') {
    return new Promise((resolve, reject) => {
      const results = [];
      const source = fs.createReadStream(filePath);
      source.on('error', reject);
      source.pipe(csvParser())
        .on('data', (data) => {
          const lead = normalizeLead(data);
          if (lead.url) {
            results.push(lead);
          }
        })
        .on('end', () => resolve(results))
        .on('error', (err) => reject(err));
    });
  }

  throw new Error(`Unsupported leads file format: ${ext}. Please use .csv or .json`);
}

/**
 * Retrieves the list of URLs that have already been successfully processed to prevent duplicate submissions.
 * Only skips leads with status SUCCESS or SUBMITTED_UNVERIFIED, allowing failed leads to be retried.
 * @param {string} resultsFilePath
 * @param {Object} [options]
 * @param {boolean} [options.onlySuccessful=true]
 * @returns {Promise<Set<string>>}
 */
export async function getProcessedUrls(resultsFilePath, { onlySuccessful = true } = {}) {
  const processed = new Set();
  if (!fs.existsSync(resultsFilePath)) return processed;

  return new Promise((resolve, reject) => {
    const source = fs.createReadStream(resultsFilePath);
    const parser = csvParser();
    let sawHeaders = false;

    source.on('error', reject);
    parser.on('error', reject);
    parser.on('headers', (headers) => {
      sawHeaders = true;
      const columns = headers.map((header) => header.replace(/^\uFEFF/, '').trim().toUpperCase());
      if (!columns.includes('URL') || !columns.includes('STATUS')) {
        source.destroy();
        reject(new Error('Results CSV is missing URL or STATUS header; refusing to risk duplicate submissions.'));
      }
    });
    parser.on('data', (row) => {
      const columns = Object.fromEntries(Object.entries(row).map(([key, value]) => [
        key.replace(/^\uFEFF/, '').trim().toUpperCase(), value,
      ]));
      const url = (columns.URL || '').trim();
      const status = (columns.STATUS || '').trim().toUpperCase();
      if (url && (!onlySuccessful || status === 'SUCCESS' || status === 'SUBMITTED_UNVERIFIED')) {
        processed.add(url);
      }
    });
    parser.on('end', () => {
      if (sawHeaders) resolve(processed);
      else reject(new Error('Results CSV is empty; refusing to risk duplicate submissions.'));
    });
    source.pipe(parser);
  });
}

/**
 * Appends a single execution result record to results.csv.
 * @param {string} resultsFilePath
 * @param {Object} result
 * @param {string} result.url
 * @param {string} result.status - SUCCESS | FAILED | CAPTCHA_ERROR | FORM_NOT_FOUND | TIMEOUT
 * @param {string} result.name
 * @param {string} result.email
 * @param {string} result.captchaSolved - YES | NO | N/A
 * @param {string} result.durationSec
 * @param {string} result.message
 */
export async function logResult(resultsFilePath, result) {
  const dir = path.dirname(resultsFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const fileExists = fs.existsSync(resultsFilePath) && fs.statSync(resultsFilePath).size > 0;
  const currentHeader = 'URL,PROFILE_ID,STATUS,CAPTCHA_SOLVED,NAME,EMAIL,DURATION_SEC,TIMESTAMP,PROOF_SCREENSHOT,MESSAGE';
  const legacyHeader = 'URL,STATUS,CAPTCHA_SOLVED,NAME,EMAIL,DURATION_SEC,TIMESTAMP,MESSAGE';
  let legacyFormat = false;
  if (fileExists) {
    const fd = fs.openSync(resultsFilePath, 'r');
    const headerBytes = Buffer.alloc(512);
    let bytesRead;
    try {
      bytesRead = fs.readSync(fd, headerBytes, 0, headerBytes.length, 0);
    } finally {
      fs.closeSync(fd);
    }
    const firstLine = headerBytes.subarray(0, bytesRead).toString('utf-8').split(/\r?\n/, 1)[0].replace(/^\uFEFF/, '').trim();
    if (firstLine === legacyHeader) legacyFormat = true;
    else if (firstLine !== currentHeader) {
      throw new Error('Unrecognized results CSV header; refusing to append misaligned data.');
    }
  }

  const csvWriter = createObjectCsvWriter({
    path: resultsFilePath,
    append: fileExists,
    header: [
      { id: 'url', title: 'URL' },
      ...(legacyFormat ? [] : [{ id: 'profileId', title: 'PROFILE_ID' }]),
      { id: 'status', title: 'STATUS' },
      { id: 'captchaSolved', title: 'CAPTCHA_SOLVED' },
      { id: 'name', title: 'NAME' },
      { id: 'email', title: 'EMAIL' },
      { id: 'durationSec', title: 'DURATION_SEC' },
      { id: 'timestamp', title: 'TIMESTAMP' },
      ...(legacyFormat ? [] : [{ id: 'proofScreenshot', title: 'PROOF_SCREENSHOT' }]),
      { id: 'message', title: 'MESSAGE' },
    ],
  });

  const record = {
    url: result.url || '',
    profileId: result.profileId || '',
    status: result.status || 'UNKNOWN',
    captchaSolved: result.captchaSolved || 'N/A',
    name: result.name || '',
    email: result.email || '',
    durationSec: result.durationSec || '0',
    timestamp: new Date().toISOString(),
    proofScreenshot: result.proofScreenshot || '',
    message: (result.message || '').replace(/[\r\n]+/g, ' '),
  };

  await csvWriter.writeRecords([record]);
}
