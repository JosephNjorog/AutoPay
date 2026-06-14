#!/usr/bin/env bash
set -euo pipefail

# Install Foundry if not already installed
if ! command -v forge &>/dev/null; then
  echo "Installing Foundry..."
  curl -L https://foundry.paradigm.xyz | bash
  # shellcheck disable=SC1090
  source "$HOME/.bashrc" 2>/dev/null || source "$HOME/.zshrc" 2>/dev/null || true
  foundryup
fi

echo "Installing contract dependencies..."
forge install OpenZeppelin/openzeppelin-contracts --no-commit
forge install eth-infinitism/account-abstraction --no-commit

echo ""
echo "Setup complete. Run 'make build' to compile contracts."
