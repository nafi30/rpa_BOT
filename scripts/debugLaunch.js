import { AdsPowerClient } from '../lib/adspower.js';
import { config } from '../config.js';

async function testProfiles() {
  const client = new AdsPowerClient({
    apiBase: config.adspower.apiBase,
    apiKey: config.adspower.apiKey,
  });

  const candidates = [
    { id: 'k18kgqgc', name: 'Profile 11' },
    { id: 'k18kfois', name: 'Profile 10' },
    { id: 'k18kepw0', name: 'Profile 9' },
  ];

  for (const c of candidates) {
    console.log(`\nTesting launch for ${c.name} (${c.id})...`);
    try {
      const res = await client.startBrowser({ profileId: c.id });
      console.log(`✓ ${c.name} SUCCESS! WS:`, res.wsEndpoint);
      // Clean stop immediately
      await client.stopBrowser(c.id);
      break;
    } catch (e) {
      console.log(`✗ ${c.name} Failed: ${e.message}`);
    }
  }
}

testProfiles();
