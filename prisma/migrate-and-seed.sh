#!/bin/sh
# EPIC-001/STORY-005/TASK-005-005
# Runs Prisma migrate deploy then db seed in sequence.
# Used as the Cloud Run Job CMD for the aaa-migrate job.
set -e

echo "=== Step 1: Apply migrations ==="
node node_modules/prisma/build/index.js migrate deploy

echo "=== Step 2: Seed framework configuration ==="
node node_modules/prisma/build/index.js db seed

echo "=== Done ==="
