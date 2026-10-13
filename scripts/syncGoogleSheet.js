import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

// Default to Henry's shared Google Sheet if no URL passed
const DEFAULT_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1Yuv5Juuk7bjJ-PW2Pz3vO4IxuxkjX7-STO97NP3YRVU/edit?usp=sharing';

/**
 * Extracts Google Sheet ID from a full Google Sheets URL.
 * @param {string} url
 * @returns {string|null}
 */
export function extractSheetId(url) {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

/**
 * Downloads a public/shared Google Sheet directly as CSV and writes to target path.
 * @param {string} [sheetUrl]
 * @param {string} [targetPath]
 */
export async function syncGoogleSheet(sheetUrl = DEFAULT_SHEET_URL, targetPath = config.files.inputLeads) {
  console.log('='.repeat(65));
  console.log('            SYNCING LEADS DIRECTLY FROM GOOGLE SHEET           ');
  console.log('='.repeat(65));

  const sheetId = extractSheetId(sheetUrl);
  if (!sheetId) {
    throw new Error(`Invalid Google Sheet URL: ${sheetUrl}`);
  }

  const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
  console.log(`[GoogleSheet] Fetching CSV export from: ${exportUrl}`);

  try {
    const res = await axios.get(exportUrl, {
      responseType: 'text',
      timeout: 20000,
    });

    const csvContent = res.data;
    if (!csvContent || csvContent.trim().length === 0) {
      console.warn('[GoogleSheet] Warning: Received empty content from Google Sheet.');
      return false;
    }

    // Ensure parent directory exists
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(targetPath, csvContent, 'utf-8');
    const lineCount = csvContent.split('\n').filter((l) => l.trim()).length;
    console.log(`✓ Successfully downloaded and saved to: ${targetPath}`);
    console.log(`✓ Total rows synced: ${lineCount}`);
    return true;
  } catch (err) {
    console.error(`✗ Failed to sync Google Sheet: ${err.message}`);
    if (err.response?.status === 404 || err.response?.status === 403) {
      console.error('  (Make sure the Google Sheet permission is set to "Anyone with the link can view")');
    }
    return false;
  }
}

// Allow CLI execution: node scripts/syncGoogleSheet.js [OPTIONAL_SHEET_URL]
const cliUrl = process.argv[2] || process.env.GOOGLE_SHEET_URL || DEFAULT_SHEET_URL;
syncGoogleSheet(cliUrl);
