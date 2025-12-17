#!/bin/bash
set -e

# Phase 1 validation script
# Runs automated tests to validate GitHub Actions architecture

echo "🧪 Phase 1 Validation - GitHub Actions Architecture"
echo "=================================================="

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TESTS_TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test result tracking
RESULTS=()

# Helper functions
log_test() {
    echo -e "${BLUE}[TEST]${NC} $1"
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    RESULTS+=("✅ $1")
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    RESULTS+=("❌ $1")
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

# Test 1: Build and TypeScript validation
log_test "TypeScript compilation and build"
if pnpm build > /dev/null 2>&1; then
    log_pass "TypeScript compiles without errors"
else
    log_fail "TypeScript compilation failed"
fi

# Test 2: Migration CLI functionality
log_test "Migration CLI basic functionality"
if pnpm migration --help > /dev/null 2>&1; then
    log_pass "Migration CLI loads successfully"
else
    log_fail "Migration CLI failed to load"
fi

# Test 3: Migration document validation
log_test "Migration document parsing"
VALID_MIGRATIONS=0
TOTAL_MIGRATIONS=0

for migration_file in migrations/*.md; do
    if [ -f "$migration_file" ]; then
        TOTAL_MIGRATIONS=$((TOTAL_MIGRATIONS + 1))
        if pnpm migration validate "$migration_file" > /dev/null 2>&1; then
            VALID_MIGRATIONS=$((VALID_MIGRATIONS + 1))
        fi
    fi
done

if [ $VALID_MIGRATIONS -gt 0 ]; then
    log_pass "Migration document parsing ($VALID_MIGRATIONS/$TOTAL_MIGRATIONS valid)"
else
    log_fail "No valid migration documents found"
fi

# Test 4: Schema validation
log_test "Migration schema validation"
if node -e "
const { validateMigrationFrontmatter } = require('./dist/config/migration-schema.js');
const testData = {
    schema_version: 1,
    id: 'test-migration',
    title: 'Test Migration',
    agent: 'mock',
    status: 'pending',
    current_step: 1,
    total_steps: 3,
    created: '2024-12-16T10:00:00Z',
    last_updated: '2024-12-16T10:00:00Z'
};
if (validateMigrationFrontmatter(testData)) {
    console.log('Schema validation passed');
    process.exit(0);
} else {
    console.log('Schema validation failed');
    process.exit(1);
}
" > /dev/null 2>&1; then
    log_pass "Migration schema validation works"
else
    log_fail "Migration schema validation failed"
fi

# Test 5: Control plane generation
log_test "Control plane issue generation"
if pnpm migration generate-control-plane > /dev/null 2>&1; then
    log_pass "Control plane issue generation works"
else
    log_fail "Control plane issue generation failed"
fi

# Test 6: GitHub Actions workflow files exist
log_test "GitHub Actions workflow files existence"
REQUIRED_WORKFLOWS=(
    ".github/workflows/detect-migrations.yml"
    ".github/workflows/control-plane.yml"
    ".github/workflows/execute-migration.yml"
)

MISSING_WORKFLOWS=0
for workflow in "${REQUIRED_WORKFLOWS[@]}"; do
    if [ ! -f "$workflow" ]; then
        log_warn "Missing workflow: $(basename "$workflow")"
        MISSING_WORKFLOWS=$((MISSING_WORKFLOWS + 1))
    fi
done

if [ $MISSING_WORKFLOWS -eq 0 ]; then
    log_pass "All required GitHub Actions workflows exist"
else
    log_fail "$MISSING_WORKFLOWS required workflow(s) missing"
fi

# Test 7: Required files exist
log_test "Required files and directories exist"
REQUIRED_FILES=(
    "migrations/"
    ".github/workflows/detect-migrations.yml"
    ".github/workflows/control-plane.yml"
    ".github/workflows/execute-migration.yml"
    "src/config/migration-schema.ts"
    "src/utils/migration-document.ts"
    "scripts/migration-cli.ts"
    "scripts/advance-migration.sh"
    "scripts/pause-migration.sh"
)

MISSING_FILES=0
for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -e "$file" ]; then
        log_warn "Missing required file/directory: $file"
        MISSING_FILES=$((MISSING_FILES + 1))
    fi
done

if [ $MISSING_FILES -eq 0 ]; then
    log_pass "All required files and directories exist"
else
    log_fail "$MISSING_FILES required files/directories missing"
fi

# Test 8: Agent adapter classes available
log_test "Agent adapter classes availability"
if node -e "
const { MockAgentAdapter } = require('./dist/adapters/agents/mock.js');
const { CursorCloudAdapter } = require('./dist/adapters/agents/cursor-cloud.js');
const { CodexCloudAdapter } = require('./dist/adapters/agents/codex-cloud.js');
const { DevinCloudAdapter } = require('./dist/adapters/agents/devin-cloud.js');

const classes = [MockAgentAdapter, CursorCloudAdapter, CodexCloudAdapter, DevinCloudAdapter];
console.log('Agent classes loaded:', classes.length);
if (classes.every(c => typeof c === 'function')) {
    process.exit(0);
} else {
    process.exit(1);
}
" > /dev/null 2>&1; then
    log_pass "Agent adapter classes are available"
else
    log_fail "Agent adapter classes failed to load"
fi

# Test 9: Package.json scripts
log_test "Package.json scripts configuration"
REQUIRED_SCRIPTS=("build" "migration" "test" "lint" "typecheck")
MISSING_SCRIPTS=0

for script in "${REQUIRED_SCRIPTS[@]}"; do
    if ! grep -q "\"$script\":" package.json; then
        log_warn "Missing npm script: $script"
        MISSING_SCRIPTS=$((MISSING_SCRIPTS + 1))
    fi
done

if [ $MISSING_SCRIPTS -eq 0 ]; then
    log_pass "All required npm scripts are configured"
else
    log_fail "$MISSING_SCRIPTS required npm scripts missing"
fi

# Test 10: Dependencies check
log_test "Required dependencies installed"
REQUIRED_DEPS=("yaml" "commander" "minimatch")
MISSING_DEPS=0

for dep in "${REQUIRED_DEPS[@]}"; do
    if ! grep -q "\"$dep\":" package.json; then
        log_warn "Missing dependency: $dep"
        MISSING_DEPS=$((MISSING_DEPS + 1))
    fi
done

if [ $MISSING_DEPS -eq 0 ]; then
    log_pass "All required dependencies are installed"
else
    log_fail "$MISSING_DEPS required dependencies missing"
fi

echo ""
echo "=================================================="
echo "📊 VALIDATION RESULTS"
echo "=================================================="

# Print all results
for result in "${RESULTS[@]}"; do
    echo "$result"
done

echo ""
echo "Summary: $TESTS_PASSED/$TESTS_TOTAL tests passed"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 Phase 1 validation PASSED!${NC}"
    echo ""
    echo "✅ Ready for manual testing and integration validation"
    echo "📋 Next steps:"
    echo "   1. Configure GitHub repository secrets"
    echo "   2. Run manual test scenarios from validation plan"
    echo "   3. Test with real cloud agents"
    echo "   4. Validate end-to-end workflows"
    exit 0
else
    echo -e "${RED}❌ Phase 1 validation FAILED${NC}"
    echo ""
    echo "🔧 Issues to fix before proceeding:"
    echo "   - $TESTS_FAILED automated tests failed"
    echo "   - Review failed tests above"
    echo "   - Fix issues and re-run validation"
    exit 1
fi