#!/bin/bash
set -e

# Advance a migration to the next step after successful PR merge
# Usage: ./scripts/advance-migration.sh <migration_id>

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

echo "📈 Advancing migration: $MIGRATION_ID"

# Extract current state
FRONTMATTER=$(awk '/^---$/{if(f==1) exit; f=1; next} f' "$MIGRATION_FILE")
CURRENT_STEP=$(echo "$FRONTMATTER" | grep "^current_step:" | sed 's/current_step: *//')
TOTAL_STEPS=$(echo "$FRONTMATTER" | grep "^total_steps:" | sed 's/total_steps: *//')

echo "Current step: $CURRENT_STEP/$TOTAL_STEPS"

# Check if migration is complete
if [ "$CURRENT_STEP" -ge "$TOTAL_STEPS" ]; then
    echo "🎉 Migration completed!"
    
    # Update status to completed
    sed -i "s/status: .*/status: completed/" "$MIGRATION_FILE"
    sed -i "s/last_updated: .*/last_updated: $(date -u +%Y-%m-%dT%H:%M:%SZ)/" "$MIGRATION_FILE"
    
    # Remove PR and branch references
    sed -i "/^pr_number:/d" "$MIGRATION_FILE"
    sed -i "/^branch:/d" "$MIGRATION_FILE"
    
    echo "✅ Migration marked as completed"
else
    # Advance to next step
    NEXT_STEP=$((CURRENT_STEP + 1))
    echo "📈 Advancing to step $NEXT_STEP"
    
    # Update current step and remove PR/branch references
    sed -i "s/current_step: .*/current_step: $NEXT_STEP/" "$MIGRATION_FILE"
    sed -i "s/status: .*/status: pending/" "$MIGRATION_FILE"
    sed -i "s/last_updated: .*/last_updated: $(date -u +%Y-%m-%dT%H:%M:%SZ)/" "$MIGRATION_FILE"
    sed -i "/^pr_number:/d" "$MIGRATION_FILE"
    sed -i "/^branch:/d" "$MIGRATION_FILE"
    
    echo "✅ Migration advanced to step $NEXT_STEP, ready for next execution"
    
    # Trigger next step execution automatically
    if command -v gh >/dev/null 2>&1; then
        echo "🚀 Triggering next step execution..."
        gh workflow run execute-migration.yml \
            -f migration_id="$MIGRATION_ID" \
            -f step_id="$NEXT_STEP"
    else
        echo "⚠️  GitHub CLI not available, trigger next step manually"
    fi
fi

echo "✅ Migration advancement completed"