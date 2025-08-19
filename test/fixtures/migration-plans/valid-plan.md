---
id: test-migration
title: Test Migration
description: A test migration for unit testing
owner: test-team
agent: claude
status: draft
dependsOn: []
strategy:
  chunkBy: directory
  maxOpenPRs: 2
steps:
  - id: step-1
    description: First step of the migration
    prompt: |
      Update all the files in this directory according to the migration plan.
  - id: step-2
    description: Second step of the migration
    prompt: |
      Complete the migration by updating remaining files.
---

# Test Migration

This is a test migration plan used for unit testing.

## Overview

This migration will test the basic functionality of the Hachiko system.

## Steps

1. **Step 1**: Update files in the first directory
2. **Step 2**: Complete the migration
