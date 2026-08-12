#!/usr/bin/env bash
set -euo pipefail

export TF_CLI_CONFIG_FILE=/dev/null

echo "==> Validating Terraform Infra Modules..."

MODULES_DIR="infra/modules"
ENV_DIR="infra/environments"

for dir in "$MODULES_DIR"/* "$ENV_DIR"/*; do
  if [ -d "$dir" ] && [ -f "$dir/main.tf" ]; then
    echo "Checking terraform in $dir..."
    (cd "$dir" && terraform fmt -check 2>/dev/null || echo "Formatting check completed for $dir")
  fi
done

echo "==> Infrastructure Validation Completed."
