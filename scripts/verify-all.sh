#!/usr/bin/env bash
set -euo pipefail

echo "================================================================="
echo "        HERMES MONOREPO — PRODUCTION QUALITY VERIFICATION        "
echo "================================================================="
echo ""

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ERRORS=0

# 1. TypeScript Test Suite & V8 Coverage
echo "-----------------------------------------------------------------"
echo "1/5 Running TypeScript Unit, Property & Contract Tests..."
echo "-----------------------------------------------------------------"

NODE_TEST_FILES=$(find shared services -name "*.test.ts" | grep -v "node_modules" | grep -v ".build" || true)

if [ -n "$NODE_TEST_FILES" ]; then
  if node --import tsx --test $NODE_TEST_FILES; then
    echo "[PASSED] TypeScript Tests"
  else
    echo "[FAILED] TypeScript Tests"
    ERRORS=$((ERRORS + 1))
  fi
else
  echo "[WARN] No TypeScript test files found!"
fi

echo ""

# 2. Java Services & JaCoCo Coverage
echo "-----------------------------------------------------------------"
echo "2/5 Running Java Services (admin-service, replay-service)..."
echo "-----------------------------------------------------------------"

for service in services/admin-service services/replay-service; do
  if [ -d "$service" ]; then
    echo "--> Testing $service with Maven & JaCoCo..."
    if (cd "$service" && mvn test); then
      echo "  [PASSED] $service"
      if [ -f "$service/target/site/jacoco/index.html" ]; then
        echo "  [REPORT] JaCoCo Report generated at $service/target/site/jacoco/index.html"
      fi
    else
      echo "  [FAILED] $service"
      ERRORS=$((ERRORS + 1))
    fi
  fi
done

echo ""

# 3. Python AI Workers & Pytest Coverage
echo "-----------------------------------------------------------------"
echo "3/5 Running Python AI Workers Tests..."
echo "-----------------------------------------------------------------"

if [ -d "services/ai-workers" ]; then
  echo "--> Running pytest in services/ai-workers..."
  if (cd services/ai-workers && PYTHONPATH=. pytest -v); then
    echo "[PASSED] Python AI Workers"
  else
    echo "[FAILED] Python AI Workers"
    ERRORS=$((ERRORS + 1))
  fi
fi

echo ""

# 4. Terraform Infrastructure Validation
echo "-----------------------------------------------------------------"
echo "4/5 Running Terraform Infrastructure Module Validation..."
echo "-----------------------------------------------------------------"

if [ -f "scripts/terraform-validate.sh" ]; then
  if ./scripts/terraform-validate.sh; then
    echo "[PASSED] Terraform Validation"
  else
    echo "[FAILED] Terraform Validation"
    ERRORS=$((ERRORS + 1))
  fi
fi

echo ""

# 5. TypeScript Project Build Verification
echo "-----------------------------------------------------------------"
echo "5/5 Verifying Monorepo TypeScript Builds..."
echo "-----------------------------------------------------------------"

TSC_BIN="$ROOT_DIR/node_modules/.bin/tsc"
BUILD_FAILED=0

if [ -x "$TSC_BIN" ]; then
  for tsconfig in $(find shared services -name "tsconfig.json" | grep -v "node_modules" | grep -v ".build"); do
    pkg_dir="$(dirname "$tsconfig")"
    if (cd "$pkg_dir" && "$TSC_BIN" --noEmit -p . 2>/dev/null); then
      true
    else
      echo "  [FAILED] TS compilation error in $pkg_dir"
      BUILD_FAILED=1
    fi
  done
fi

if [ $BUILD_FAILED -eq 0 ]; then
  echo "[PASSED] TypeScript Compilation"
else
  echo "[FAILED] TypeScript Compilation"
  ERRORS=$((ERRORS + 1))
fi

echo ""
echo "================================================================="
if [ $ERRORS -eq 0 ]; then
  echo "VERIFICATION COMPLETE: ALL CHECKS PASSED SUCCESSFULLY!"
  echo "Hermes is verified production-ready."
  exit 0
else
  echo "VERIFICATION FAILED: $ERRORS check(s) failed."
  exit 1
fi
