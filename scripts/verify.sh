#!/bin/sh
# Runs every quality gate of this project. Agents, CI and people run this same script.
# A gate is a command that exits non-zero when its objective is not met.
#
# Usage: verify.sh            every gate, on the changes against the main branch where a gate is
#                             incremental
#        verify.sh --final    the final verification: the gates of final_gates, on the whole project

set -u

# --- project configuration (written by init) ---

MAIN_BRANCH="main"

# Gate tools are called directly from the project's own dependencies.
PATH="$(cd "$(dirname "$0")/.." && pwd)/node_modules/.bin:$PATH"
export PATH

# Extended regexes of skipped or focused tests and of coverage or linter exclusions, one per line.
TEST_EVASION_PATTERNS='\.(skip|only|todo|skipIf|runIf)[(.]
(^|[^A-Za-z0-9_$.])(xit|xdescribe|xtest|fit|fdescribe)\(
@(skip|ignore|wip)([^A-Za-z0-9_-]|$)
return ["'"'"']pending["'"'"']
(v8|c8|istanbul) ignore
Stryker (disable|restore)
eslint-disable
@ts-(ignore|nocheck|expect-error)
prettier-ignore
depcruise-ignore
jscpd:ignore'

# Gates run in order: a gate may read what an earlier one produced, such as a coverage report.
# CHANGED_FILES holds the files added or modified against the main branch, one per line, for the
# incremental gates.
project_gates() {
  # Call each tool directly, never a script of the dependency manifest (gates.md).
  run_gate acceptance 'cucumber-js'
  run_gate unit 'rm -rf coverage && vitest run --project unit --coverage'
  run_gate coverage 'node scripts/check-coverage.js'
  run_gate integration 'vitest run --project integration'
  run_gate types 'tsc --noEmit'
  run_gate lint 'eslint --max-warnings 0 .'
  run_gate format 'prettier --check .'
  run_gate complexity 'eslint --no-config-lookup -c eslint.complexity.config.js --max-warnings 0 .'
  run_gate size 'eslint --no-config-lookup -c eslint.size.config.js --max-warnings 0 .'
  run_gate architecture 'depcruise src --config .dependency-cruiser.cjs'
  run_gate duplication 'jscpd --config .jscpd.json'
  # Only the changed source files that stryker.config.json mutates.
  run_gate mutation 'files=$(printf "%s\n" "$CHANGED_FILES" | grep -E "^src/.*\.ts$" |
    grep -vE "\.test\.ts$|^src/main\.ts$" | paste -sd, -)
    [ -z "$files" ] || stryker run --mutate "$files"'
}

final_gates() {
  # The whole project, once per job, before the owner decides (gates.md).
  run_gate mutation 'stryker run'
}

# --- end project configuration ---

REQUIRED_GATES="acceptance unit"
SECRET_PATTERNS='sk-ant-[A-Za-z0-9_-]{20,}
sk-proj-[A-Za-z0-9_-]{20,}
sk_live_[A-Za-z0-9]{20,}
AKIA[0-9A-Z]{16}
gh[pousr]_[A-Za-z0-9]{30,}
github_pat_[A-Za-z0-9_]{30,}
xox[baprs]-[A-Za-z0-9-]{12,}
-----BEGIN [A-Z ]*PRIVATE KEY-----'

FAILED=0
RAN=""

pass() {
  printf 'PASS %s\n' "$1"
}

fail() {
  printf 'FAIL %s\n' "$1"
  [ -n "${2:-}" ] && printf '%s\n' "$2" | sed 's/^/     /'
  FAILED=$((FAILED + 1))
}

run_gate() {
  RAN="$RAN $1"
  output=$(sh -c "$2" 2>&1)
  if [ $? -eq 0 ]; then
    pass "$1"
  else
    fail "$1" "$(printf '%s\n' "$output" | tail -n 20)"
  fi
}

check_required_gates() {
  for gate in $REQUIRED_GATES; do
    case " $RAN " in
      *" $gate "*) ;;
      *) fail "$gate" "required gate is not configured" ;;
    esac
  done
}

# Prints "<file><TAB><text>" for each line added since the main branch, new untracked files included.
added_lines() {
  git diff -U0 --no-color "$1" | awk '
    /^\+\+\+ / { file = substr($0, 7); next }
    /^\+/ { print file "\t" substr($0, 2) }
  '
  git ls-files --others --exclude-standard | while IFS= read -r file; do
    awk -v file="$file" '{ print file "\t" $0 }' "$file"
  done
}

# Prints the files with an added line matching a pattern of $2.
files_matching() {
  tab=$(printf '\t')
  printf '%s\n' "$2" | while IFS= read -r pattern; do
    [ -n "$pattern" ] || continue
    printf '%s\n' "$1" | grep -E "$tab.*($pattern)" | cut -f 1
  done | sort -u
}

check_added_lines() {
  if ! git rev-parse --verify -q "origin/$MAIN_BRANCH" >/dev/null 2>&1; then
    printf 'SKIP no-test-evasion and no-secrets: there is no remote main branch yet\n'
    return
  fi
  lines=$(added_lines "$(git merge-base "origin/$MAIN_BRANCH" HEAD)")

  if [ -z "$TEST_EVASION_PATTERNS" ]; then
    fail no-test-evasion "TEST_EVASION_PATTERNS is empty"
  else
    files=$(files_matching "$lines" "$TEST_EVASION_PATTERNS")
    if [ -n "$files" ]; then fail no-test-evasion "$files"; else pass no-test-evasion; fi
  fi

  # Only the files are reported: printing the match would leak the secret.
  files=$(files_matching "$lines" "$SECRET_PATTERNS")
  if [ -n "$files" ]; then fail no-secrets "$files"; else pass no-secrets; fi
}

# Files added or modified against the main branch, committed or not. Empty without a remote main.
changed_files() {
  git rev-parse --verify -q "origin/$MAIN_BRANCH" >/dev/null 2>&1 || return 0
  base=$(git merge-base "origin/$MAIN_BRANCH" HEAD)
  { git diff --name-only --diff-filter=AMR "$base"; git ls-files --others --exclude-standard; } |
    sort -u
}

finish() {
  if [ "$FAILED" -gt 0 ]; then
    printf 'verify: %s gate(s) failed\n' "$FAILED"
    exit 1
  fi
  printf 'verify: OK\n'
}

CHANGED_FILES=$(changed_files)
export CHANGED_FILES

case "${1:-}" in
  --final)
    final_gates
    [ -n "$RAN" ] || printf 'SKIP final: no final gates configured\n'
    ;;
  '')
    project_gates
    check_required_gates
    check_added_lines
    ;;
  *)
    printf 'usage: verify.sh [--final]\n' >&2
    exit 2
    ;;
esac
finish
