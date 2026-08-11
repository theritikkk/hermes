#!/usr/bin/env bash
# scripts/deploy-lambdas.sh
#
# Deploys the bundles produced by bundle-lambdas.sh (infra/.build/*.zip),
# which already contain the correct vendored @hermes/* + npm dependency
# closure (see scripts/copy-deps.js).
#
# This script does NOT re-zip anything itself.
#
# Run scripts/bundle-lambdas.sh first, then this script.
# Usage: AWS_REGION=ap-south-1 ./scripts/deploy-lambdas.sh [environment]

set -euo pipefail

ENVIRONMENT="${1:-dev}"
AWS_REGION="${AWS_REGION:-us-east-1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/infra/.build"

echo "Deploying Lambdas to environment: $ENVIRONMENT  (region: $AWS_REGION)"

# ── All bundled Lambdas ─────────────────────────────────────────────────────
# This list must stay in sync with bundle-lambdas.sh.
LAMBDAS=(
  # Critical path (API → EventBridge → Step Functions → projections)
  "command-api"
  "query-api"
  "validate-worker"
  "ocr-worker"
  "classify-worker"
  "execution-projection"
  "usage-projection"
  "opensearch-projection"
  # Infrastructure workers
  "outbox-publisher"
  "snapshot-trigger"
  "dlq-handler"
  "webhook-dispatcher"
  "outbox-republisher"
)

if [ ! -d "$BUILD" ]; then
  echo "Error: $BUILD not found. Run scripts/bundle-lambdas.sh first." >&2
  exit 1
fi

FAILED=()

for NAME in "${LAMBDAS[@]}"; do
  ZIP_FILE="$BUILD/${NAME}.zip"
  FUNCTION_NAME="hermes-${ENVIRONMENT}-${NAME}"

  if [ ! -f "$ZIP_FILE" ]; then
    echo "Warning: $ZIP_FILE not found (did bundle-lambdas.sh run?), skipping $NAME"
    FAILED+=("$NAME")
    continue
  fi

  echo "Deploying $FUNCTION_NAME from $ZIP_FILE..."
  aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file "fileb://$ZIP_FILE" \
    --region "$AWS_REGION" \
    --no-cli-pager \
    --output json | jq -r '.FunctionArn'

  echo "Waiting for $FUNCTION_NAME update to finish..."
  aws lambda wait function-updated \
    --function-name "$FUNCTION_NAME" \
    --region "$AWS_REGION"

  echo "  ✓ $FUNCTION_NAME deployed"
done

echo ""
if [ ${#FAILED[@]} -eq 0 ]; then
  echo "All ${#LAMBDAS[@]} Lambdas deployed successfully."
else
  echo "Deployed $((${#LAMBDAS[@]} - ${#FAILED[@]}))/${#LAMBDAS[@]} Lambdas."
  echo "Skipped (zip not found): ${FAILED[*]}"
  exit 1
fi
