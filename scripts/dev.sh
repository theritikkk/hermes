#!/usr/bin/env bash
# ==============================================================================
# Hermes  Developer Helper CLI
# ==============================================================================
set -euo pipefail

REGION="${AWS_REGION:-ap-south-1}"
ENV="${HERMES_ENV:-dev}"

echo ""
echo "  Hermes Developer CLI  (Region: ${REGION}, Env: ${ENV})"
echo ""
echo "1) Run Unit Tests across Workspaces"
echo "2) Build & Bundle All Lambda Functions"
echo "3) Deploy Lambdas to AWS"
echo "4) Execute Live Critical-Path Smoke Test"
echo "5) Tail CloudWatch Logs (command-api)"
echo "6) Exit"
echo ""

read -p "Select an option [1-6]: " CHOICE

case "$CHOICE" in
  1)
    echo " Running Unit Tests..."
    npm test
    ;;
  2)
    echo " Building & Bundling Lambdas..."
    npm run build
    ./scripts/bundle-lambdas.sh
    ;;
  3)
    echo " Deploying Lambdas to AWS (${ENV})..."
    ./scripts/bundle-lambdas.sh
    AWS_REGION="${REGION}" ./scripts/deploy-lambdas.sh "${ENV}"
    ;;
  4)
    echo " Executing Live Smoke Test..."
    AWS_REGION="${REGION}" ./scripts/smoke-test.sh
    ;;
  5)
    echo " Tailing /aws/lambda/hermes-${ENV}-command-api..."
    aws logs tail "/aws/lambda/hermes-${ENV}-command-api" --region "${REGION}" --follow
    ;;
  6)
    echo "Goodbye!"
    exit 0
    ;;
  *)
    echo "Invalid option."
    exit 1
    ;;
esac
