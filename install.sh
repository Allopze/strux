#!/usr/bin/env bash
set -e

# 🔍 UI/UX Auditor — Linux/macOS One-Liner Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/allopze/strux/main/install.sh | bash

BOLD='\033[1m'
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
RESET='\033[0m'

echo -e "${CYAN}"
echo "┌────────────────────────────────────────────────────────────────────────┐"
echo "│  🔍 Installing UI/UX Auditor — Autonomous UI/UX & A11y Engine          │"
echo "└────────────────────────────────────────────────────────────────────────┘"
echo -e "${RESET}"

# 1. Check Node.js requirement
if ! command -v node >/dev/null 2>&1; then
    echo -e "${RED}✖ Node.js is required but not installed.${RESET}"
    echo -e "Please install Node.js (v20+) from: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo -e "${YELLOW}▲ Warning: Node.js version $(node -v) detected. UI/UX Auditor recommends Node.js >= 20.${RESET}"
fi

# 2. Determine installation target
INSTALL_DIR="$HOME/.local/share/uiux-auditor"
BIN_DIR="$HOME/.local/bin"

mkdir -p "$BIN_DIR"
mkdir -p "$INSTALL_DIR"

echo -e "${CYAN}==>${RESET} Downloading & setting up UI/UX Auditor in ${BOLD}$INSTALL_DIR${RESET}..."

# Clone or update repo
if [ -d "$INSTALL_DIR/.git" ]; then
    echo -e "${CYAN}==>${RESET} Updating existing installation..."
    cd "$INSTALL_DIR"
    git pull --quiet
else
    echo -e "${CYAN}==>${RESET} Cloning latest version..."
    git clone --depth 1 https://github.com/allopze/strux.git "$INSTALL_DIR" --quiet
    cd "$INSTALL_DIR"
fi

# 3. Install dependencies and build
echo -e "${CYAN}==>${RESET} Installing dependencies and compiling TypeScript..."
npm install --silent
npm run build --silent

# 4. Install Playwright Chromium if missing
echo -e "${CYAN}==>${RESET} Ensuring Playwright browser dependencies..."
npx playwright install chromium --silent || true

# 5. Create symlink in ~/.local/bin
ln -sf "$INSTALL_DIR/dist/cli/index.js" "$BIN_DIR/uiux-audit"
chmod +x "$BIN_DIR/uiux-audit"

# 6. Verify PATH
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
    echo ""
    echo -e "${YELLOW}▲ Note:${RESET} $BIN_DIR is not in your PATH."
    echo "Add it to your shell configuration (~/.bashrc, ~/.zshrc):"
    echo -e "  ${BOLD}export PATH=\"\$HOME/.local/bin:\$PATH\"${RESET}"
fi

echo ""
echo -e "${GREEN}═════════════════════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}  ✨ UI/UX Auditor successfully installed!${RESET}"
echo -e "${GREEN}═════════════════════════════════════════════════════════════════════════${RESET}"
echo ""
echo -e "  Start interactive chat:        ${BOLD}uiux-audit${RESET}"
echo -e "  Run full audit on URL:         ${BOLD}uiux-audit audit http://localhost:3000${RESET}"
echo -e "  Interactive findings viewer:   ${BOLD}uiux-audit inspect${RESET}"
echo ""
