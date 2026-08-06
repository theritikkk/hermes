#!/usr/bin/env bash
# Creates a minimal placeholder.zip for Lambda function Terraform resources.
# Run this once before 'terraform apply' in a fresh environment.
# The actual Lambda code is deployed by scripts/deploy-lambdas.sh
echo 'exports.handler = async () => ({ statusCode: 200 });' > /tmp/placeholder_handler.js
zip -j "$(dirname "$0")/placeholder.zip" /tmp/placeholder_handler.js
rm /tmp/placeholder_handler.js
echo "placeholder.zip created"
