#!/usr/bin/env bash
set -euo pipefail

# Deploys the bundles produced by bundle-lambdas.sh (infra/.build/*.zip),
# which already contain the correct vendored @hermes/* + npm dependency
# closure (see scripts/copy-deps.js). This script does NOT re-zip anything
# itself — the previous version did, from the wrong source paths, with no
# dependencies included, and only covered 4 of the 6 lambdas actually on
# today's critical path (and one of THOSE four pointed at a directory that
# doesn't exist: services/lambda-workers/execution-projection, when the
# real path is services/event-projections/execution-projection — so it
# silently skipped the one lambda from its list that's actually needed for
# the smoke test).
#
# Run scripts/bundle-lambdas.sh first.

ENVIRONMENT="${1:-dev}"
AWS_REGION="${AWS_REGION:-us-east-1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/infra/.build"

echo "Deploying Lambdas to environment: $ENVIRONMENT"

# These are the lambdas bundle-lambdas.sh currently produces (the full set
# on today's smoke-test critical path: command-api -> EventBridge ->
# Step Functions -> validate/ocr/classify workers -> execution-projection
# -> query-api). The other 7 functions provisioned in main.tf
# (outbox-publisher, snapshot-trigger, dlq-handler, opensearch-projection,
# usage-projection, webhook-dispatcher, outbox-republisher) aren't wired
# into the bundler yet and are intentionally out of scope for today - they
# stay on placeholder.zip until bundle-lambdas.sh is extended to cover them.
LAMBDAS=(
  "command-api"
  "query-api"
  "validate-worker"
  "ocr-worker"
  "classify-worker"
  "execution-projection"
)

if [ ! -d "$BUILD" ]; then
  echo "Error: $BUILD not found. Run scripts/bundle-lambdas.sh first." >&2
  exit 1
fi

for NAME in "${LAMBDAS[@]}"; do
  ZIP_FILE="$BUILD/${NAME}.zip"
  FUNCTION_NAME="hermes-${ENVIRONMENT}-${NAME}"

  if [ ! -f "$ZIP_FILE" ]; then
    echo "Warning: $ZIP_FILE not found (did bundle-lambdas.sh run?), skipping $NAME"
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
done

echo "All bundled Lambdas deployed successfully."
echo "Note: outbox-publisher, snapshot-trigger, dlq-handler, opensearch-projection,"
echo "usage-projection, webhook-dispatcher, and outbox-republisher are still running"
echo "placeholder.zip - not on today's critical path, follow up separately."

