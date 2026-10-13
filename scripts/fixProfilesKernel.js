import axios from 'axios';
import { config } from '../config.js';

const TARGET_PROFILES = ['k18kfois', 'k18kepw0', 'k18kdlbf', 'k18kbsw8', 'k185pe4p'];

/**
 * Automatically updates AdsPower profiles to use the latest installed SunBrowser kernel on the machine.
 * Prevents "SunBrowser 141 is not ready, please download" errors.
 */
export async function alignProfilesKernel(
  apiBase = config.adspower.apiBase,
  apiKey = config.adspower.apiKey,
  profiles = TARGET_PROFILES
) {
  console.log('[KernelAlign] Aligning AdsPower profile kernels to "latest" installed kernel...');
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'api-key': apiKey,
  };

  for (const id of profiles) {
    const payload = {
      user_id: id,
      fingerprint_config: {
        browser_kernel_config: {
          type: 'chrome',
          version: 'latest',
        },
      },
    };

    try {
      const res = await axios.post(`${apiBase}/api/v1/user/update`, payload, { headers, timeout: 8000 });
      if (res.data?.code === 0) {
        console.log(`[KernelAlign] ✓ Profile ${id}: Successfully set kernel to "latest"`);
      } else {
        console.warn(`[KernelAlign] ✗ Profile ${id}: ${res.data?.msg || JSON.stringify(res.data)}`);
      }
    } catch (err) {
      console.warn(`[KernelAlign] Notice for profile ${id}: ${err.message}`);
    }
  }
}

// Allow direct CLI execution: node scripts/fixProfilesKernel.js
if (process.argv[1]?.includes('fixProfilesKernel.js')) {
  alignProfilesKernel().then(() => console.log('\n[KernelAlign] Completed!'));
}

export default alignProfilesKernel;
