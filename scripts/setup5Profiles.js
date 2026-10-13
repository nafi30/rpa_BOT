import axios from 'axios';
import { config } from '../config.js';

// Decodo Residential Proxy - United States Sticky Targeting
const PROXY_HOST = process.env.DECODO_PROXY_HOST || 'gate.decodo.com';
const PROXY_PORT = process.env.DECODO_PROXY_PORT || '7000';
const PROXY_BASE_USER = process.env.DECODO_PROXY_USER || '';
const PROXY_PASS = process.env.DECODO_PROXY_PASSWORD || '';

// The 5 target profiles in AdsPower
const TARGET_PROFILES = [
  { id: 'k18kfois', name: 'Profile 10', session: 'k18kfois' },
  { id: 'k18kepw0', name: 'Profile 9', session: 'k18kepw0' },
  { id: 'k18kdlbf', name: 'Profile 8', session: 'k18kdlbf' },
  { id: 'k18kbsw8', name: 'Profile 7', session: 'k18kbsw8' },
  { id: 'k185pe4p', name: 'Profile 6', session: 'k185pe4p' },
];

export async function configureFiveProfiles() {
  if (!PROXY_BASE_USER || !PROXY_PASS) {
    throw new Error('DECODO_PROXY_USER and DECODO_PROXY_PASSWORD must be configured before updating profiles.');
  }
  console.log('='.repeat(70));
  console.log(' CONFIGURING 5 ADSPOWER PROFILES WITH US RESIDENTIAL PROXIES ');
  console.log('='.repeat(70));

  const headers = {
    'Authorization': `Bearer ${config.adspower.apiKey}`,
    'api-key': config.adspower.apiKey,
  };

  const sessionSalt = Math.floor(Date.now() / (1000 * 1800)); // Refreshes sticky pool every 30m
  for (const p of TARGET_PROFILES) {
    const proxyUser = `${PROXY_BASE_USER}-session-${p.session}_${sessionSalt}`;
    console.log(`\nConfiguring ${p.name} (${p.id}) -> US Residential Proxy...`);

    const payload = {
      user_id: p.id,
      user_proxy_config: {
        proxy_soft: 'other',
        proxy_type: 'http',
        proxy_host: PROXY_HOST,
        proxy_port: PROXY_PORT,
        proxy_user: proxyUser,
        proxy_password: PROXY_PASS,
      },
      fingerprint_config: {
        browser_kernel_config: {
          type: 'chrome',
          version: 'latest',
        },
        automatic_timezone: '1',
        language: ['en-US', 'en'],
        webrtc: 'proxy',
      },
    };

    try {
      const res = await axios.post(`${config.adspower.apiBase}/api/v1/user/update`, payload, { headers, timeout: 15000 });
      if (res.data?.code === 0) {
        console.log(`✓ ${p.name} (${p.id}) successfully updated:`);
        console.log(`  - Proxy: ${PROXY_HOST}:${PROXY_PORT} (US Geo-Targeted Sticky Session: ${p.session})`);
        console.log(`  - Kernel: latest installed Chromium (SunBrowser 142)`);
      } else {
        console.warn(`✗ ${p.name} failed: ${res.data?.msg || JSON.stringify(res.data)}`);
      }
    } catch (err) {
      console.error(`✗ ${p.name} error: ${err.message}`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(' Profile update requests completed; verify each browser exit IP separately.');
  console.log('='.repeat(70) + '\n');
}

if (process.argv[1]?.includes('setup5Profiles.js')) {
  configureFiveProfiles();
}

export default configureFiveProfiles;
