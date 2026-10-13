import axios from 'axios';
import { config } from '../config.js';

async function inspectProfiles() {
  const headers = {
    'Authorization': `Bearer ${config.adspower.apiKey}`,
    'api-key': config.adspower.apiKey,
  };

  try {
    const res = await axios.get(`${config.adspower.apiBase}/api/v1/user/list?page_size=20`, { headers });
    for (const p of res.data.data.list) {
      console.log(`- Serial ${p.serial_number} (${p.user_id}): ${p.name}`);
    }
  } catch (e) {
    console.error(e.message);
  }
}

inspectProfiles();
