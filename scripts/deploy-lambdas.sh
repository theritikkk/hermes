#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${1:-dev}"
AWS_REGION="${AWS_REGION:-us-east-1}"

echo "Deploying Lambda workers to environment: $ENVIRONMENT"

LAMBDA_WORKERS=(
  "outbox-publisher"
  "execution-projection"
  "snapshot-trigger"
  "dlq-handler"
)

for WORKER in "${LAMBDA_WORKERS[@]}"; do
  FUNCTION_NAME="hermes-${ENVIRONMENT}-${WORKER}"
  WORKER_DIR="services/lambda-workers/${WORKER}"

  if [ ! -d "$WORKER_DIR" ]; then
    echo "Warning: $WORKER_DIR not found, skipping $WORKER"
    continue
  fi

  echo "Packaging $WORKER..."
  cd "$WORKER_DIR"
  zip -r "../../../.build/${WORKER}.zip" dist/ node_modules/ --quiet
  cd - > /dev/null

  echo "Deploying $FUNCTION_NAME..."
  aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file "fileb://.build/${WORKER}.zip" \
    --region "$AWS_REGION" \
    --no-cli-pager \
    --output json | jq -r '.FunctionArn'

  echo "Waiting for $FUNCTION_NAME update..."
  aws lambda wait function-updated \
    --function-name "$FUNCTION_NAME" \
    --region "$AWS_REGION"
done

echo "All Lambda workers deployed successfully."
