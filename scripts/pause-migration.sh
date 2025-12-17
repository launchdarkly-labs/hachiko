#!/bin/bash
set -e

# Pause a migration after PR is closed without merging
# Usage: ./scripts/pause-migration.sh <migration_id>

MIGRATION_ID="$1"
if [ -z "$MIGRATION_ID" ]; then
    echo "Usage: $0 <migration_id>"
    exit 1
fi

MIGRATION_FILE="migrations/${MIGRATION_ID}.md"

if [ ! -f "$MIGRATION_FILE" ]; then
    echo "❌ Migration file not found: $MIGRATION_FILE"
    exit 1
fi

echo "⏸️  Pausing migration: $MIGRATION_ID"

# Update status to paused
sed -i "s/status: .*/status: paused/" "$MIGRATION_FILE"
sed -i "s/last_updated: .*/last_updated: $(date -u +%Y-%m-%dT%H:%M:%SZ)/" "$MIGRATION_FILE"

# Remove PR number but keep branch reference for debugging
sed -i "/^pr_number:/d" "$MIGRATION_FILE"

# Add/update error message about being paused
if ! grep -q "^error:" "$MIGRATION_FILE"; then
    sed -i "/^last_updated:/a error: Migration paused - PR closed without merging" "$MIGRATION_FILE"
else
    sed -i "s/error: .*/error: Migration paused - PR closed without merging/" "$MIGRATION_FILE"
fi

echo "✅ Migration paused successfully"
echo "💡 To resume, check the migration checkbox in the control-plane issue"