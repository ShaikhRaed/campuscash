#!/bin/sh
# Runs a repo-local Ollama install from .ollama-local/ (see README). Everything it writes,
# including models and its identity file, stays in that gitignored folder.
# Usage: scripts/ollama-local.sh serve
#        scripts/ollama-local.sh pull llama3.2:3b

ROOT="$(cd "$(dirname "$0")/.." && pwd)/.ollama-local"
if [ ! -x "$ROOT/bin/ollama" ]; then
  echo "No repo-local Ollama at $ROOT/bin. See 'Local model setup' in README.md." >&2
  exit 1
fi

export HOME="$ROOT/home"
export OLLAMA_MODELS="$ROOT/models"
export OLLAMA_HOST="127.0.0.1:11434"
export OLLAMA_NO_CLOUD=1
exec "$ROOT/bin/ollama" "$@"
