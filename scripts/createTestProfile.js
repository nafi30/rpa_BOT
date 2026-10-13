import axios from 'axios';
import { config } from '../config.js';

async function createDirectTestProfile() {
  const headers = {
    'Authorization': `Bearer ${config.adspower.apiKey}`,
    'api-key': config.adspower.apiKey,
  };

  const payload = {
    name: 'RPA Test Profile (Direct)',
    group_id: '0',
    user_proxy_config: {
      proxy_soft: 'no_proxy',
    },
    fingerprint_config: {
      browser_kernel_config: {
        version: '153',
        type: 'chrome',
      },
    },
  };

  try {
    const res = await axios.post(`${config.adspower.apiBase}/api/v1/user/create`, payload, { headers });
    console.log('Create Profile Response:', JSON.stringify(res.data, null, 2));
    if (res.data?.code === 0 && res.data.data?.id) {
      console.log(`✓ Created new direct profile with ID: ${res.data.data.id}`);
    }
  } catch (err) {
    console.error('Failed to create profile:', err.message);
  }
}

createDirectTestProfile();
