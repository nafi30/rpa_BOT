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
      fs.createReadStream(filePath)
        .pipe(csvParser())
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
 * @returns {Set<string>}
 */
export function getProcessedUrls(resultsFilePath, { onlySuccessful = true } = {}) {
  const processed = new Set();
  if (!fs.existsSync(resultsFilePath)) {
    return processed;
  }

  try {
    const content = fs.readFileSync(resultsFilePath, 'utf-8');
    const lines = content.split('\n');
    // Header is on line 0: URL,PROFILE_ID,STATUS,...
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.split(',');
      if (parts.length >= 3) {
        const url = parts[0].replace(/^"|"$/g, '').trim();
        const status = parts[2].replace(/^"|"$/g, '').trim().toUpperCase();

        if (onlySuccessful) {
          if (status === 'SUCCESS' || status === 'SUBMITTED_UNVERIFIED') {
            processed.add(url);
          }
        } else {
          processed.add(url);
        }
      }
    }
  } catch (err) {
    console.warn(`[DataManager] Warning: Failed to read previous results file: ${err.message}`);
  }

  return processed;
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

  const fileExists = fs.existsSync(resultsFilePath);

  const csvWriter = createObjectCsvWriter({
    path: resultsFilePath,
    append: fileExists,
    header: [
      { id: 'url', title: 'URL' },
      { id: 'profileId', title: 'PROFILE_ID' },
      { id: 'status', title: 'STATUS' },
      { id: 'captchaSolved', title: 'CAPTCHA_SOLVED' },
      { id: 'name', title: 'NAME' },
      { id: 'email', title: 'EMAIL' },
      { id: 'durationSec', title: 'DURATION_SEC' },
      { id: 'timestamp', title: 'TIMESTAMP' },
      { id: 'proofScreenshot', title: 'PROOF_SCREENSHOT' },
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
