import axios from 'axios';
import { config } from '../config.js';

async function checkKernels() {
  const headers = {};
  if (config.adspower.apiKey) {
    headers['Authorization'] = `Bearer ${config.adspower.apiKey}`;
    headers['api-key'] = config.adspower.apiKey;
  }

  try {
    const res = await axios.get(`${config.adspower.apiBase}/api/v1/user/list?page_size=20`, {
      headers,
    });
    for (const p of res.data.data.list) {
      console.log(`Profile: ${p.name} (${p.user_id}) | Serial: ${p.serial_number}`);
    }
  } catch (err) {
    console.error(err.message);
  }
}

checkKernels();
