# GitHub Actions and Hostinger VPS deployment

The `Stage code on Hostinger VPS` workflow runs on pushes to `main` when the repository variable `VPS_STAGING_ENABLED` is `true`. It uploads each commit to `/home/rpa-deploy/releases/<commit>`, runs `npm ci`, and checks JavaScript syntax. It does not modify the live `/root/rpa-bot` directory, start the outreach bot, or send inquiries.

## Current setup

- The VPS SSH host fingerprint was verified against the Hostinger console.
- A dedicated `rpa-deploy` Linux user and SSH key were created for GitHub Actions.
- This user cannot read `/root/rpa-bot/.env`.
- The live project was backed up to `/root/rpa-bot-backup-before-actions-20261014`.
- GitHub Actions uses four repository secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_PRIVATE_KEY`, and `VPS_KNOWN_HOSTS`.
- `VPS_STAGING_ENABLED` is the switch for automatic staging.

## Verify a run

Open the repository's **Actions → Stage code on Hostinger VPS** workflow. A green run means that the commit was uploaded and validated in its own release directory. It does not mean Apartments.com accepted a request or that the live bot was changed.

## Live cutover

The existing `/root/rpa-bot` directory is not a Git checkout and contains live `.env`, leads, results, screenshots, and dependencies. Inspect and preserve those before switching the scheduled bot to a validated release. Do not use `rsync --delete` on that directory. An automatic live activation needs a separate, narrowly scoped promotion step after the first release and VPS diagnostic pass.