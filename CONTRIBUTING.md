# Contributing to Hermes

Thank you for your interest in contributing to Hermes! This guide outlines the development workflow, coding standards, and process for submitting changes.

---

## Code of Conduct

Maintain a respectful, professional, and collaborative community environment.

---

## Development Setup

### 1. Requirements

- **Node.js**: `>= 20.0.0`
- **Terraform**: `>= 1.8.0`
- **AWS CLI**: `>= 2.15`
- **npm**: `>= 10.0.0`

### 2. Initial Setup

```bash
# Clone the repository
git clone https://github.com/theritikkk/hermes
cd hermes

# Install dependencies
npm install

# Build all TypeScript workspace packages
npm run build

# Run unit test suite
npm test
```

---

## Repository Structure

Hermes is structured as an `npm` workspace monorepo:

```
hermes/
├── shared/                       # Core domain libraries & utilities
│   ├── domain/                   # Domain models, event types, AuthContext & RBAC
│   ├── event-store/              # DynamoDB Event Store & replay logic
│   ├── command-handlers/         # Command processing handlers
│   ├── activity-runner/          # Step Functions worker loop runner
│   └── observability/            # Structured logging & X-Ray tracing
├── services/                     # Microservices & worker Lambdas
│   ├── command-api/              # HTTP POST /assets & /step-results API
│   ├── query-api/                # HTTP GET CQRS read model queries
│   ├── lambda-workers/           # Async background event workers
│   │   ├── outbox-publisher/     # SQS stream publisher
│   │   ├── snapshot-trigger/     # DynamoDB Stream aggregate snapshotter
│   │   ├── dlq-handler/          # Poison message auditor
│   │   ├── webhook-dispatcher/   # HMAC signed HTTP webhook sender
│   │   └── outbox-republisher/   # Cron stale event republisher
│   ├── event-projections/        # CQRS projection consumers
│   │   ├── execution-projection/ # Multi-model DynamoDB projection
│   │   ├── usage-projection/     # Monthly usage counter projection
│   │   └── opensearch-projection/# NDJSON OpenSearch indexing projection
│   └── activity-workers/         # Step Functions workflow workers
│       ├── validate-worker/      # Document header validator
│       ├── ocr-worker/           # Text extractor
│       └── classify-worker/      # Document classifier
├── infra/                        # Infrastructure-as-Code (Terraform)
│   ├── modules/                  # Reusable Terraform infrastructure modules
│   └── environments/             # Environment manifests (dev, staging)
└── scripts/                      # Developer CLI automation scripts
```

---

## Development & Testing Workflow

### 1. Creating a Feature Branch

```bash
git checkout -b feature/my-new-feature
```

### 2. Unit Testing

Write unit tests in `src/**/*.test.ts` alongside your code using Node's native test runner (`node:test`):

```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Feature Test', () => {
  test('executes logic cleanly', () => {
    assert.equal(1 + 1, 2);
  });
});
```

Run unit tests across workspaces:
```bash
npm test
```

### 3. Bundling & Deploying to AWS Dev Environment

```bash
# Bundle Lambdas into infra/.build/
./scripts/bundle-lambdas.sh

# Deploy zip packages to AWS Lambda
AWS_REGION=ap-south-1 ./scripts/deploy-lambdas.sh dev

# Execute live AWS smoke test
AWS_REGION=ap-south-1 ./scripts/smoke-test.sh
```

---

## Pull Request Guidelines

1. **Self-Review**: Ensure `npm run build` and `npm test` pass cleanly.
2. **Commit Messages**: Use clean, descriptive conventional commits (`feat: add usage limit alarm`, `fix: handle SQS retry timeout`).
3. **CI Pipeline**: PRs must pass the GitHub Actions CI pipeline (`.github/workflows/ci.yml`).
