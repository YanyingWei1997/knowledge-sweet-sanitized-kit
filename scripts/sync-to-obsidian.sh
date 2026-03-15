#!/bin/zsh
set -euo pipefail

SOURCE_ROOT="${SOURCE_ROOT:-<YOUR_OPENCLAW_HOME>/workspace/knowledge-sweet}"
TARGET_ROOT="${TARGET_ROOT:-<YOUR_OBSIDIAN_VAULT>/knowledge-sweet}"
LOG_PREFIX="[knowledge-sweet->obsidian]"

mkdir -p "$TARGET_ROOT"
mkdir -p "$TARGET_ROOT/知识库"

echo "$LOG_PREFIX syncing 知识库/"
rsync -a --exclude '.DS_Store' "$SOURCE_ROOT/知识库/" "$TARGET_ROOT/知识库/"

echo "$LOG_PREFIX syncing README.md"
cp "$SOURCE_ROOT/README.md" "$TARGET_ROOT/README.md"

echo "$LOG_PREFIX sync complete"
