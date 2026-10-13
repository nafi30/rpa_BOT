# GitHub Actions to Hostinger VPS

The workflow in `.github/workflows/stage-vps.yml` uploads each `main` commit into a unique directory under `/root/rpa-bot-releases/<commit>` and validates it. It does not modify `/root/rpa-bot`, restart a process, or send inquiries.

## One-time VPS preparation

Run these commands in the Hostinger VPS terminal as the account that will receive deployments. The current workflow expects `root` because the existing bot is under `/root`.

```bash
sudo apt-get update
sudo apt-get install -y rsync
node --version
npm --version
mkdir -p /root/.ssh /root/rpa-bot-releases
chmod 700 /root/.ssh
ssh-keygen -t ed25519 -f /root/.ssh/github-actions-deploy -N ''
cat /root/.ssh/github-actions-deploy.pub >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
```

Copy the entire private key from `/root/.ssh/github-actions-deploy` directly into the GitHub secret described below. Do not put it in a chat, commit, or log. Once the GitHub secret is saved and a deployment works, remove the private key file from the VPS; leave the public key entry in `authorized_keys`.

From the Hostinger console, inspect the server host-key fingerprint:

```bash
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

For `VPS_KNOWN_HOSTS`, use one line containing the VPS IP, one space, then the key type and public key from `/etc/ssh/ssh_host_ed25519_key.pub`. Verify the fingerprint against the Hostinger console before saving it. Do not use `StrictHostKeyChecking=no`.

## GitHub settings

Open the repository's **Settings → Secrets and variables → Actions**. Add these four repository secrets:

| Secret | Value |
| --- | --- |
| `VPS_HOST` | VPS public IP or DNS name |
| `VPS_USER` | `root` for the current `/root` deployment path |
| `VPS_SSH_PRIVATE_KEY` | Full private key created above |
| `VPS_KNOWN_HOSTS` | Verified SSH host-key line for the VPS |

Under **Variables**, set `VPS_STAGING_ENABLED` to `true` only after all four secrets exist. A push to `main` will then stage and validate the code automatically. You can also use **Actions → Stage code on Hostinger VPS → Run workflow**.

The GitHub personal access token previously pasted into chat is not needed for this workflow. Revoke it.

## First verification

After a green workflow, check the new release directory and run the read-only diagnostic from that release with the live `.env` settings supplied separately. The release does not contain `.env`, leads, results, or screenshots. Keep the existing `/root/rpa-bot` untouched until its current Git state, runtime data, and AdsPower setup have been inspected and a cutover has been approved.