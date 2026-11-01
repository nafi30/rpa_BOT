#!/usr/bin/env bash
# =============================================================================
#  VPS First-Time Setup Script for RPA Bot (Ubuntu 24.04)
#  Run this once as root after cloning the repo to /root/rpa-bot
# =============================================================================
set -e

BOT_DIR="/root/rpa-bot"

echo "============================================================"
echo "  RPA Bot VPS Setup"
echo "============================================================"

# ── 1. Fix script permissions ──────────────────────────────────
echo "[1/6] Setting script permissions..."
chmod +x "$BOT_DIR/run-bot.sh"
chmod +x "$BOT_DIR/deploy/"*.sh 2>/dev/null || true
echo "      Done."

# ── 2. Install Node.js 20 if missing ──────────────────────────
if ! command -v node &>/dev/null; then
  echo "[2/6] Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
else
  echo "[2/6] Node.js $(node -v) already installed. Skipping."
fi

# ── 3. Install PM2 globally ───────────────────────────────────
echo "[3/6] Installing PM2..."
npm install -g pm2
pm2 --version
echo "      Done."

# ── 4. Install project dependencies ───────────────────────────
echo "[4/6] Installing npm dependencies..."
cd "$BOT_DIR"
npm install --omit=dev
echo "      Done."

# ── 5. Install Playwright Chromium browser ────────────────────
echo "[5/6] Installing Playwright Chromium..."
npx playwright install chromium --with-deps
echo "      Done."

# ── 6. Configure PM2 startup (auto-start on reboot) ──────────
echo "[6/6] Configuring PM2 startup..."
pm2 startup systemd -u root --hp /root | tail -1 | bash || true
echo "      Done."

echo ""
echo "============================================================"
echo "  Setup complete! Next steps:"
echo ""
echo "  1. Make sure .env is configured with your credentials"
echo "     nano $BOT_DIR/.env"
echo ""
echo "  2. Start the bot with PM2:"
echo "     cd $BOT_DIR && pm2 start ecosystem.config.cjs"
echo ""
echo "  3. Watch live logs:"
echo "     pm2 logs rpa-property-bot"
echo ""
echo "  4. Save PM2 state (so it restarts on reboot):"
echo "     pm2 save"
echo "============================================================"
