# RPA Property Lead Automation Bot

A robust, error-resistant browser automation engine built with **Node.js**, **Playwright**, **AdsPower Local API**, and **CapSolver**. It navigates listing URLs, parses and populates contact forms with human-like typing interactions, resolves CAPTCHAs automatically, and logs results with deduplication.

---

## Architecture Overview

```
rpa-bot/
├── config.js               # Centralized configuration & validation
├── selectors.config.js     # Form field selectors & domain overrides
├── index.js                # Core iteration pipeline & lifecycle runner
├── leads.csv               # Input leads CSV template (URL, Name, Email, Phone, Message)
├── leads.json              # Alternative JSON input template
├── results.csv             # Output execution log (appended automatically)
├── lib/
│   ├── adspower.js         # AdsPower Local API controller (start/stop/health)
│   ├── browser.js          # Playwright CDP connection & page lifecycle
│   ├── capsolver.js        # CapSolver detection, task polling & token injection
│   ├── dataManager.js      # CSV/JSON ingestion & deduplication tracking
│   └── formFiller.js       # Humanized typing, cursor jitter & form interaction
└── scripts/
    └── healthCheck.js      # Pre-flight system diagnostic & credentials tester
```

---

## Quick Start

### 1. Configure Credentials in `.env`
Open [`.env`](file:///f:/rpa%20bot/.env) and populate the values:

```env
# AdsPower Settings
ADSPOWER_API_BASE=http://local.adspower.net:50325
ADSPOWER_PROFILE_ID=your_adspower_profile_id_here

# CapSolver API Key
CAPSOLVER_API_KEY=CAP-XXXXXXXXXXXXXXXXXXXXXXXX

# Optional: Dedicated proxy for CapSolver (if not using ProxyLess)
# CAPSOLVER_PROXY=http://user:pass@host:port
```

### 2. Pre-Flight Health Check
Run the pre-flight check to verify your AdsPower connection, CapSolver balance, and leads parsing:

```powershell
npm test
# or: node scripts/healthCheck.js
```

### 3. Run the Automation
Start processing the queue:

```powershell
npm start
# or: node index.js
```

---

## Features & Resilience

1. **Anti-Detect Profile Isolation**: Connects directly via CDP to AdsPower's native Chromium fingerprint and residential proxy.
2. **Stealth Humanization**: Keystroke delays jitter between 45–135ms with micro-pauses at punctuation, smooth scrolling, and hover effects before clicking submit.
3. **CAPTCHA Solving**: Automatically detects reCAPTCHA v2/v3, hCaptcha, and Cloudflare Turnstile, submits resolution tasks to CapSolver, injects tokens into hidden inputs, and triggers registered callback routines.
4. **Resilient Form Discovery**: Uses multi-tier fallback selectors for Full Name, First/Last Name, Email, Phone, Message, and Consent checkboxes. Custom domain selectors can be added to [`selectors.config.js`](file:///f:/rpa%20bot/selectors.config.js).
5. **Deduplication & Resumption**: Checks [`results.csv`](file:///f:/rpa%20bot/results.csv) before each lead so interruptions can be resumed without resending inquiries to previously processed URLs.
6. **Graceful Teardown**: Captures timestamped screenshots to `./screenshots/` upon failures, closes the CDP session, and cleanly terminates the AdsPower profile.
