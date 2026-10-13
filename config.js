import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
dotenv.config({ path: path.resolve(__dirname, '.env') });

export const config = {
  adspower: {
    apiBase: process.env.ADSPOWER_API_BASE || 'http://local.adspower.net:50325',
    apiKey: process.env.ADSPOWER_API_KEY || '',
    profileId: process.env.ADSPOWER_PROFILE_ID || '',
    serialNumber: process.env.ADSPOWER_SERIAL_NUMBER || '',
    profilePool: (process.env.ADSPOWER_PROFILE_IDS || process.env.ADSPOWER_PROFILE_ID || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    rotationStrategy: process.env.ROTATION_STRATEGY || 'batch', // 'batch' (e.g. 20 per profile) or 'round-robin'
    leadsPerProfile: parseInt(process.env.LEADS_PER_PROFILE || '20', 10),
    headless: process.env.HEADLESS === 'true',
  },
  capsolver: {
    apiKey: process.env.CAPSOLVER_API_KEY || '',
    pollIntervalMs: parseInt(process.env.CAPSOLVER_POLL_INTERVAL_MS || '3000', 10),
    timeoutMs: parseInt(process.env.CAPSOLVER_TIMEOUT_MS || '60000', 10),
    proxy: process.env.CAPSOLVER_PROXY || '',
  },
  files: {
    inputLeads: path.resolve(__dirname, process.env.INPUT_LEADS_FILE || './leads.csv'),
    outputResults: path.resolve(__dirname, process.env.OUTPUT_RESULTS_FILE || './results.csv'),
    screenshotsDir: path.resolve(__dirname, process.env.SCREENSHOTS_DIR || './screenshots'),
  },
  delays: {
    betweenLeadsMin: parseInt(process.env.DELAY_BETWEEN_LEADS_MIN_MS || '5000', 10),
    betweenLeadsMax: parseInt(process.env.DELAY_BETWEEN_LEADS_MAX_MS || '12000', 10),
    typingMin: parseInt(process.env.TYPING_DELAY_MIN_MS || '45', 10),
    typingMax: parseInt(process.env.TYPING_DELAY_MAX_MS || '135', 10),
    actionPauseMin: parseInt(process.env.ACTION_PAUSE_MIN_MS || '600', 10),
    actionPauseMax: parseInt(process.env.ACTION_PAUSE_MAX_MS || '1800', 10),
    navigationTimeout: parseInt(process.env.NAVIGATION_TIMEOUT_MS || '45000', 10),
  },
  sender: {
    defaultName: process.env.SENDER_NAME || 'Hassam Abbas',
    defaultCompany: process.env.SENDER_COMPANY || 'Coastland Properties',
    defaultPhone: process.env.SENDER_PHONE || '(949) 620-0776',
    emails: (process.env.SENDER_EMAILS || process.env.SENDER_EMAIL || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    customMessages: (process.env.CUSTOM_MESSAGES || '')
      .split('|||')
      .map((s) => s.trim())
      .filter(Boolean),
    webhookUrl: process.env.WEBHOOK_URL || '',
  },
};

/**
 * Validates essential configuration parameters.
 * @param {Object} options
 * @param {boolean} options.requireLiveCredentials - Whether to strictly assert API keys are not placeholders
 */
export function validateConfig({ requireLiveCredentials = false } = {}) {
  const errors = [];

  if (config.adspower.profilePool.length === 0 && !config.adspower.serialNumber) {
    errors.push('No AdsPower profile configured in ADSPOWER_PROFILE_IDS or ADSPOWER_PROFILE_ID.');
  }

  if (requireLiveCredentials) {
    if (!config.capsolver.apiKey || config.capsolver.apiKey.includes('YOUR_KEY')) {
      errors.push('CAPSOLVER_API_KEY is not set or still contains the placeholder value.');
    }
    if (config.adspower.profileId.includes('your_adspower_profile_id')) {
      errors.push('ADSPOWER_PROFILE_ID still contains placeholder value.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default config;
