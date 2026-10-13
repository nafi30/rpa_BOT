# VPS diagnostic: one profile, one listing

This check does not fill or submit a contact form. Do not run the full lead queue while investigating an access denial.

1. Back up the VPS project and keep its existing `results.csv` and screenshots.
2. Deploy the files in `vps-diagnostic-update.tar.gz` into `/root/rpa-bot`.
3. From `/root/rpa-bot`, run:

   ```bash
   HEADLESS=true npm run diagnose:vps -- 'https://www.apartments.com/cmpnd-miami-miami-fl/tlrs2nc/' k18kfois
   ```

4. Record the browser exit IP, country, network, target HTTP status, final URL, page title, page reference, and screenshot path. The command exits with status 1 when it detects access denial. A screenshot is still saved.

If the browser fails to start, collect the AdsPower service's browser launch logs. The diagnostic will not reach the IP or target checks in that case. Do not switch the browser to visible mode until the AdsPower service and display arrangement have been verified separately.

`run-bot.sh` no longer forces `HEADLESS=false` or rewrites the five AdsPower profiles at every start. Use `npm run setup:profiles` only when an explicit profile update is intended.
