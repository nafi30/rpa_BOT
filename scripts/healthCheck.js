import { config, validateConfig } from '../config.js';
import { AdsPowerClient } from '../lib/adspower.js';
import { CapSolverClient } from '../lib/capsolver.js';
import { loadLeads } from '../lib/dataManager.js';
import fs from 'fs';

async function runHealthCheck() {
  console.log('='.repeat(60));
  console.log('         RPA BOT PRE-FLIGHT SYSTEM HEALTH CHECK         ');
  console.log('='.repeat(60));

  let overallPass = true;

  // 1. File & Directory Checks
  console.log('\n[1/4] Checking Files & Environment...');
  const envExists = fs.existsSync('.env');
  console.log(` .env file exists: ${envExists ? '✓ YES' : '✗ NO'}`);
  if (!envExists) overallPass = false;

  const leadsExists = fs.existsSync(config.files.inputLeads);
  console.log(` Leads file (${config.files.inputLeads}): ${leadsExists ? '✓ YES' : '✗ NOT FOUND'}`);

  if (leadsExists) {
    try {
      const leads = await loadLeads(config.files.inputLeads);
      console.log(` Loaded sample leads count: ✓ ${leads.length} leads parsed`);
    } catch (err) {
      console.log(` Leads parsing error: ✗ ${err.message}`);
      overallPass = false;
    }
  }

  // 2. Configuration Validation
  console.log('\n[2/4] Validating Configuration Settings...');
  const validation = validateConfig({ requireLiveCredentials: false });
  if (validation.valid) {
    console.log(' Configuration structure: ✓ VALID');
  } else {
    console.log(' Configuration structure: ✗ ISSUES:');
    validation.errors.forEach(e => console.log(`   - ${e}`));
  }

  // 3. AdsPower Local API Check
  console.log('\n[3/4] Testing AdsPower Local API Reachability...');
  console.log(` Target API Base: ${config.adspower.apiBase}`);
  const adsClient = new AdsPowerClient({
    apiBase: config.adspower.apiBase,
    apiKey: config.adspower.apiKey,
    profileId: config.adspower.profileId,
    serialNumber: config.adspower.serialNumber,
  });

  const adsHealthy = await adsClient.isApiHealthy();
  if (adsHealthy) {
    console.log(' AdsPower Local API: ✓ CONNECTED & RESPONSIVE');
    if (config.adspower.profileId && !config.adspower.profileId.includes('your_adspower')) {
      const status = await adsClient.checkBrowserActive();
      console.log(` Target profile status: ${status.status}`);
    }
  } else {
    console.log(' AdsPower Local API: ✗ UNREACHABLE');
    console.log('   (Ensure AdsPower desktop application is running and Local API is enabled in Settings)');
  }

  // 4. CapSolver API Check
  console.log('\n[4/4] Testing CapSolver API...');
  if (!config.capsolver.apiKey || config.capsolver.apiKey.includes('YOUR_KEY')) {
    console.log(' CapSolver API Key: ⚠ Placeholder detected. (Waiting for user credentials)');
  } else {
    const capClient = new CapSolverClient({ apiKey: config.capsolver.apiKey });
    const balanceResult = await capClient.checkBalance();
    if (balanceResult.valid) {
      console.log(` CapSolver API: ✓ AUTHENTICATED (Balance: $${balanceResult.balance.toFixed(3)})`);
    } else {
      console.log(` CapSolver API: ✗ FAILED (${balanceResult.message})`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(' Health Check completed.');
  console.log('='.repeat(60) + '\n');
}

runHealthCheck().catch((err) => {
  console.error('[HealthCheck Error]:', err);
});
