#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
standards_root="${AULYC_STANDARDS_ROOT:-${STANDARDS_ROOT:-/Users/crp/Projects/Codex 开发规范}}"
tool="${standards_root}/scripts/dual_mirror_release.py"
phase="${1:-}"

if [[ ! -f "${tool}" ]]; then
  echo "Central dual-mirror tool is unavailable: ${tool}" >&2
  exit 1
fi

case "${phase}" in
  prepare)
    shift
    cd "${project_root}"
    exec python3 "${tool}" prepare --project aulyckanban "$@"
    ;;
  preflight|publish|verify)
    shift
    cd "${project_root}"
    exec python3 "${tool}" "${phase}" "$@"
    ;;
  *)
    echo "Usage: $0 <prepare|preflight|publish|verify> [central tool arguments]" >&2
    exit 2
    ;;
esac
