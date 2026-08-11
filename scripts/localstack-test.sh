#!/usr/bin/env bash
# ==============================================================================
# Hermes — LocalStack Integration Test Runner
# ==============================================================================
set -euo pipefail

ENDPOINT="${LOCALSTACK_ENDPOINT:-http://localhost:4566}"
REGION="ap-south-1"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Hermes LocalStack Integration Test Runner"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Endpoint : ${ENDPOINT}"
echo "  Region   : ${REGION}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. Verify LocalStack Health
if ! curl -s "${ENDPOINT}/_localstack/health" > /dev/null; then
  echo "⚠️ LocalStack is not running. Please start LocalStack first:"
  echo "   docker-compose -f docker-compose.localstack.yml up -d"
  exit 1
fi

echo "✓ LocalStack is running and healthy."

# 2. Provision Mock DynamoDB Tables
echo "► Provisioning LocalStack DynamoDB Tables..."
aws --endpoint-url="${ENDPOINT}" dynamodb create-table \
  --table-name hermes-dev-event-store \
  --attribute-definitions AttributeName=PK,AttributeType=S AttributeName=SK,AttributeType=S \
  --key-schema AttributeName=PK,KeyType=HASH AttributeName=SK,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --region "${REGION}" > /dev/null || true

aws --endpoint-url="${ENDPOINT}" dynamodb create-table \
  --table-name hermes-dev-execution-read-model \
  --attribute-definitions AttributeName=PK,AttributeType=S AttributeName=SK,AttributeType=S \
  --key-schema AttributeName=PK,KeyType=HASH AttributeName=SK,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --region "${REGION}" > /dev/null || true

echo "✓ DynamoDB tables created."

# 3. Provision Mock EventBridge Bus
echo "► Provisioning LocalStack EventBridge Bus..."
aws --endpoint-url="${ENDPOINT}" events create-event-bus \
  --name hermes-dev-events \
  --region "${REGION}" > /dev/null || true

echo "✓ EventBridge bus created."

# 4. Run Integration Test Assertions
echo "► Running LocalStack Integration Assertions..."
npm test

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  LOCALSTACK INTEGRATION TESTS PASSED"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
