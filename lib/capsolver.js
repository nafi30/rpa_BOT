import axios from 'axios';

/**
 * Client for CapSolver API with DOM detection and token injection routines.
 */
export class CapSolverClient {
  /**
   * @param {Object} options
   * @param {string} options.apiKey
   * @param {number} [options.pollIntervalMs=3000]
   * @param {number} [options.timeoutMs=60000]
   * @param {string} [options.proxy] - Optional proxy string (e.g., http://user:pass@host:port)
   */
  constructor({ apiKey, pollIntervalMs = 3000, timeoutMs = 60000, proxy = '' } = {}) {
    this.apiKey = apiKey;
    this.pollIntervalMs = pollIntervalMs;
    this.timeoutMs = timeoutMs;
    this.proxy = proxy;

    this.http = axios.create({
      baseURL: 'https://api.capsolver.com',
      timeout: 25000,
    });
  }

  /**
   * Checks CapSolver account balance to ensure key validity and funds.
   * @returns {Promise<{ valid: boolean, balance: number, message?: string }>}
   */
  async checkBalance() {
    try {
      const res = await this.http.post('/getBalance', {
        clientKey: this.apiKey,
      });

      if (res.data?.errorId === 0) {
        return {
          valid: true,
          balance: res.data.balance,
        };
      }

      return {
        valid: false,
        balance: 0,
        message: res.data?.errorDescription || `Error code ${res.data?.errorCode}`,
      };
    } catch (err) {
      return {
        valid: false,
        balance: 0,
        message: err.message,
      };
    }
  }

  /**
   * Detects the presence of known CAPTCHAs in the Playwright Page context.
   * @param {import('playwright-core').Page} page
   * @returns {Promise<{ detected: boolean, type?: string, siteKey?: string, pageUrl?: string, isInvisible?: boolean }>}
   */
  async detectCaptcha(page) {
    try {
      const detection = await page.evaluate(() => {
        // 1. Check for reCAPTCHA v2 / v3
        const recaptchaEl = document.querySelector('.g-recaptcha, [data-sitekey]:not(.h-captcha):not(.cf-turnstile)');
        const recaptchaIframe = document.querySelector('iframe[src*="google.com/recaptcha"], iframe[src*="recaptcha.net"]');
        const recaptchaResponse = document.querySelector('#g-recaptcha-response, [name="g-recaptcha-response"]');

        if (recaptchaEl || recaptchaIframe || recaptchaResponse) {
          let siteKey = recaptchaEl?.getAttribute('data-sitekey') || '';
          let isInvisible = recaptchaEl?.getAttribute('data-size') === 'invisible';

          if (!siteKey && recaptchaIframe) {
            const src = recaptchaIframe.getAttribute('src') || '';
            const match = src.match(/[?&]k=([^&]+)/);
            if (match) siteKey = match[1];
          }

          // Check window.___grecaptcha_cfg if sitekey still empty
          if (!siteKey && window.___grecaptcha_cfg && window.___grecaptcha_cfg.clients) {
            try {
              for (const id of Object.keys(window.___grecaptcha_cfg.clients)) {
                const client = window.___grecaptcha_cfg.clients[id];
                const findKey = (obj, depth = 0) => {
                  if (!obj || depth > 4) return null;
                  if (typeof obj.sitekey === 'string') return obj.sitekey;
                  for (const k in obj) {
                    if (typeof obj[k] === 'object') {
                      const res = findKey(obj[k], depth + 1);
                      if (res) return res;
                    }
                  }
                  return null;
                };
                const found = findKey(client);
                if (found) {
                  siteKey = found;
                  break;
                }
              }
            } catch {
              // Ignore inspection errors
            }
          }

          if (siteKey) {
            return {
              detected: true,
              type: 'recaptcha_v2',
              siteKey,
              isInvisible,
            };
          }
        }

        // 2. Check for hCaptcha
        const hcaptchaEl = document.querySelector('.h-captcha, [data-hcaptcha-widget-id]');
        const hcaptchaIframe = document.querySelector('iframe[src*="hcaptcha.com"]');
        const hcaptchaResponse = document.querySelector('[name="h-captcha-response"]');

        if (hcaptchaEl || hcaptchaIframe || hcaptchaResponse) {
          let siteKey = hcaptchaEl?.getAttribute('data-sitekey') || '';
          if (!siteKey && hcaptchaIframe) {
            const src = hcaptchaIframe.getAttribute('src') || '';
            const match = src.match(/[?&]sitekey=([^&]+)/);
            if (match) siteKey = match[1];
          }

          if (siteKey) {
            return {
              detected: true,
              type: 'hcaptcha',
              siteKey,
              isInvisible: false,
            };
          }
        }

        // 3. Check for Cloudflare Turnstile
        const turnstileEl = document.querySelector('.cf-turnstile');
        const turnstileIframe = document.querySelector('iframe[src*="challenges.cloudflare.com"]');
        const turnstileResponse = document.querySelector('[name="cf-turnstile-response"]');

        if (turnstileEl || turnstileIframe || turnstileResponse) {
          let siteKey = turnstileEl?.getAttribute('data-sitekey') || '';
          if (!siteKey && turnstileIframe) {
            const src = turnstileIframe.getAttribute('src') || '';
            const match = src.match(/[?&]sitekey=([^&]+)/);
            if (match) siteKey = match[1];
          }

          if (siteKey) {
            return {
              detected: true,
              type: 'turnstile',
              siteKey,
            };
          }
        }

        return { detected: false };
      });

      if (detection.detected) {
        detection.pageUrl = page.url();
      }

      return detection;
    } catch (err) {
      console.warn(`[CapSolver] CAPTCHA detection scan warning: ${err.message}`);
      return { detected: false };
    }
  }

  /**
   * Initiates a CAPTCHA solution task on CapSolver and polls for the response token.
   * @param {Object} options
   * @param {string} options.type - 'recaptcha_v2' | 'recaptcha_v3' | 'hcaptcha' | 'turnstile'
   * @param {string} options.websiteURL
   * @param {string} options.websiteKey
   * @param {boolean} [options.isInvisible=false]
   * @returns {Promise<{ success: boolean, token?: string, error?: string }>}
   */
  async solve({ type, websiteURL, websiteKey, isInvisible = false }) {
    if (!this.apiKey) {
      throw new Error('CapSolver API key is not configured.');
    }

    let taskType;
    if (type === 'recaptcha_v2') {
      taskType = this.proxy ? 'ReCaptchaV2Task' : 'ReCaptchaV2TaskProxyLess';
    } else if (type === 'hcaptcha') {
      taskType = this.proxy ? 'HCaptchaTask' : 'HCaptchaTaskProxyLess';
    } else if (type === 'turnstile') {
      taskType = this.proxy ? 'AntiTurnstileTask' : 'AntiTurnstileTaskProxyLess';
    } else {
      taskType = this.proxy ? 'ReCaptchaV2Task' : 'ReCaptchaV2TaskProxyLess';
    }

    const taskPayload = {
      type: taskType,
      websiteURL,
      websiteKey,
      isInvisible,
    };

    if (this.proxy) {
      taskPayload.proxy = this.proxy;
    }

    console.log(`[CapSolver] Submitting ${taskType} for key: ${websiteKey} at ${websiteURL}`);

    const createRes = await this.http.post('/createTask', {
      clientKey: this.apiKey,
      task: taskPayload,
    });

    const createData = createRes.data;
    if (createData.errorId !== 0) {
      throw new Error(`CapSolver createTask failed: [${createData.errorCode}] ${createData.errorDescription}`);
    }

    const taskId = createData.taskId;

    // Fast path: if task already ready
    if (createData.status === 'ready' && createData.solution) {
      const token = createData.solution.gRecaptchaResponse || createData.solution.token;
      return { success: true, token };
    }

    // Polling path
    const startTime = Date.now();
    console.log(`[CapSolver] Task initiated (ID: ${taskId}). Polling every ${this.pollIntervalMs}ms...`);

    while (Date.now() - startTime < this.timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));

      const pollRes = await this.http.post('/getTaskResult', {
        clientKey: this.apiKey,
        taskId,
      });

      const pollData = pollRes.data;

      if (pollData.errorId !== 0) {
        throw new Error(`CapSolver task ${taskId} failed: [${pollData.errorCode}] ${pollData.errorDescription}`);
      }

      if (pollData.status === 'ready') {
        const token =
          pollData.solution?.gRecaptchaResponse ||
          pollData.solution?.token ||
          pollData.solution?.userAgent;

        console.log(`[CapSolver] CAPTCHA solved successfully in ${Math.round((Date.now() - startTime) / 1000)}s!`);
        return { success: true, token };
      }

      console.log(`[CapSolver] Task ${taskId} status: ${pollData.status}...`);
    }

    throw new Error(`CapSolver polling timed out after ${this.timeoutMs / 1000} seconds.`);
  }

  /**
   * Injects the solved token into the target page and invokes registered callbacks.
   * @param {import('playwright-core').Page} page
   * @param {string} token
   * @param {string} type - 'recaptcha_v2' | 'hcaptcha' | 'turnstile'
   * @returns {Promise<boolean>}
   */
  async injectTokenAndTrigger(page, token, type) {
    console.log(`[CapSolver] Injecting solved token (${type}) into DOM...`);

    return await page.evaluate(({ token, type }) => {
      let injected = false;

      // Helper to dispatch input/change events
      const triggerEvents = (element) => {
        if (!element) return;
        element.value = token;
        element.innerHTML = token;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      };

      if (type === 'recaptcha_v2' || type === 'recaptcha_v3') {
        const textareas = document.querySelectorAll('#g-recaptcha-response, [name="g-recaptcha-response"]');
        textareas.forEach((el) => {
          el.style.display = 'block';
          triggerEvents(el);
          injected = true;
        });

        // Trigger grecaptcha callback if available
        if (window.___grecaptcha_cfg && window.___grecaptcha_cfg.clients) {
          try {
            const findAndCallCallback = (obj, depth = 0) => {
              if (!obj || depth > 5) return false;
              if (typeof obj.callback === 'function') {
                obj.callback(token);
                return true;
              }
              if (typeof obj.callback === 'string' && typeof window[obj.callback] === 'function') {
                window[obj.callback](token);
                return true;
              }
              for (const k in obj) {
                if (typeof obj[k] === 'object') {
                  if (findAndCallCallback(obj[k], depth + 1)) return true;
                }
              }
              return false;
            };

            for (const id of Object.keys(window.___grecaptcha_cfg.clients)) {
              findAndCallCallback(window.___grecaptcha_cfg.clients[id]);
            }
          } catch (e) {
            console.warn('Error invoking ___grecaptcha_cfg callback:', e);
          }
        }

        // Check data-callback attribute on widget
        const widget = document.querySelector('.g-recaptcha[data-callback]');
        if (widget) {
          const fnName = widget.getAttribute('data-callback');
          if (fnName && typeof window[fnName] === 'function') {
            window[fnName](token);
          }
        }
      } else if (type === 'hcaptcha') {
        const textareas = document.querySelectorAll('[name="h-captcha-response"], [name="g-recaptcha-response"]');
        textareas.forEach((el) => {
          el.style.display = 'block';
          triggerEvents(el);
          injected = true;
        });

        // Trigger hcaptcha callback if configured
        const widget = document.querySelector('.h-captcha[data-callback]');
        if (widget) {
          const fnName = widget.getAttribute('data-callback');
          if (fnName && typeof window[fnName] === 'function') {
            window[fnName](token);
          }
        }
      } else if (type === 'turnstile') {
        const inputs = document.querySelectorAll('[name="cf-turnstile-response"]');
        inputs.forEach((el) => {
          triggerEvents(el);
          injected = true;
        });

        const widget = document.querySelector('.cf-turnstile[data-callback]');
        if (widget) {
          const fnName = widget.getAttribute('data-callback');
          if (fnName && typeof window[fnName] === 'function') {
            window[fnName](token);
          }
        }
      }

      return injected;
    }, { token, type });
  }
}

export default CapSolverClient;
