import axios from 'axios';

/**
 * Controller class for the AdsPower Local API.
 */
export class AdsPowerClient {
  /**
   * @param {Object} options
   * @param {string} options.apiBase - Base URL (e.g., http://local.adspower.net:50325)
   * @param {string} [options.profileId] - Profile User ID
   * @param {string} [options.serialNumber] - Profile Serial Number
   */
  constructor({ apiBase = 'http://local.adspower.net:50325', apiKey = '', profileId = '', serialNumber = '' } = {}) {
    this.apiBase = apiBase.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.profileId = profileId;
    this.serialNumber = serialNumber;

    const headers = {};
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
      headers['api-key'] = this.apiKey;
    }

    this.http = axios.create({
      baseURL: this.apiBase,
      timeout: 30000,
      headers,
    });
  }

  /**
   * Builds the query params for user identification (user_id takes precedence over serial_number).
   * @private
   */
  _buildProfileParams(overrideProfileId, overrideSerialNumber) {
    const id = overrideProfileId || this.profileId;
    const serial = overrideSerialNumber || this.serialNumber;

    if (id) return { user_id: id };
    if (serial) return { serial_number: serial };

    throw new Error('Neither AdsPower Profile ID (user_id) nor Serial Number (serial_number) was provided.');
  }

  /**
   * Verifies if the AdsPower Local API service is responsive.
   * @returns {Promise<boolean>}
   */
  async isApiHealthy() {
    try {
      // AdsPower standard status check endpoint
      const res = await this.http.get('/status');
      return res.status === 200;
    } catch (err) {
      // Fallback try active endpoint
      try {
        const res = await this.http.get('/api/v1/browser/active', {
          params: { user_id: 'test' },
        });
        return res.status === 200;
      } catch {
        return false;
      }
    }
  }

  /**
   * Checks if a specific browser profile is currently active/open.
   * @param {string} [profileId]
   * @param {string} [serialNumber]
   * @returns {Promise<{ active: boolean, status: string }>}
   */
  async checkBrowserActive(profileId, serialNumber) {
    try {
      const params = this._buildProfileParams(profileId, serialNumber);
      const res = await this.http.get('/api/v1/browser/active', { params });
      if (res.data && res.data.code === 0) {
        const status = res.data.data?.status || 'Inactive';
        return { active: status.toLowerCase() === 'active', status };
      }
      return { active: false, status: res.data?.msg || 'Unknown' };
    } catch (err) {
      return { active: false, status: err.message };
    }
  }

  /**
   * Launches an AdsPower profile and extracts the WebSocket CDP endpoint.
   * @param {Object} [options]
   * @param {string} [options.profileId]
   * @param {string} [options.serialNumber]
   * @param {boolean} [options.headless]
   * @param {number} [options.openTabs=1]
   * @returns {Promise<{ wsEndpoint: string, debugPort: string, rawData: Object }>}
   */
  async startBrowser({ profileId, serialNumber, headless = false, openTabs = 1 } = {}) {
    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1920,1080',
      '--start-maximized',
    ];

    const params = {
      ...this._buildProfileParams(profileId, serialNumber),
      open_tabs: openTabs,
      headless: headless ? '1' : '0',
      launch_args: JSON.stringify(launchArgs),
    };

    console.log(`[AdsPower] Requesting browser start with params:`, JSON.stringify(params));

    try {
      const res = await this.http.get('/api/v1/browser/start', { params });
      const body = res.data;

      if (!body) {
        throw new Error('Received empty response from AdsPower Local API.');
      }

      if (body.code !== 0) {
        // If already started, attempt to retrieve debug port/active ws
        if (body.msg && body.msg.toLowerCase().includes('already')) {
          console.log('[AdsPower] Profile appears already active. Attempting to query active status...');
          const activeStatus = await this.checkBrowserActive(profileId, serialNumber);
          if (activeStatus.active && body.data?.ws?.puppeteer) {
            return {
              wsEndpoint: body.data.ws.puppeteer,
              debugPort: body.data.debug_port,
              rawData: body.data,
            };
          }
        }
        throw new Error(`AdsPower API returned error code ${body.code}: ${body.msg}`);
      }

      const wsPuppeteer = body.data?.ws?.puppeteer;
      if (!wsPuppeteer) {
        throw new Error(`No Puppeteer/CDP WebSocket URL found in AdsPower response: ${JSON.stringify(body)}`);
      }

      console.log(`[AdsPower] Browser started successfully. CDP WebSocket: ${wsPuppeteer}`);
      return {
        wsEndpoint: wsPuppeteer,
        debugPort: body.data.debug_port,
        rawData: body.data,
      };
    } catch (err) {
      if (err.code === 'ECONNREFUSED' || err.message.includes('ECONNREFUSED')) {
        throw new Error(
          `Cannot connect to AdsPower Local API at ${this.apiBase}. Is the AdsPower desktop app open with Local API enabled?`
        );
      }
      throw err;
    }
  }

  /**
   * Stops an AdsPower profile.
   * @param {string} [profileId]
   * @param {string} [serialNumber]
   * @returns {Promise<boolean>}
   */
  async stopBrowser(profileId, serialNumber) {
    const params = this._buildProfileParams(profileId, serialNumber);
    console.log(`[AdsPower] Requesting browser stop for profile:`, JSON.stringify(params));

    try {
      const res = await this.http.get('/api/v1/browser/stop', { params });
      if (res.data && res.data.code === 0) {
        console.log('[AdsPower] Browser profile stopped cleanly.');
        return true;
      }
      console.warn(`[AdsPower] Stop returned response:`, res.data);
      return false;
    } catch (err) {
      console.warn(`[AdsPower] Warning: Failed to stop browser profile: ${err.message}`);
      return false;
    }
  }
}

export default AdsPowerClient;
