#!/bin/bash
# Static integrity checks for the Executive Intelligence System.
#
# Run from the repository root at every milestone, and after ANY restructure
# of a core/ file. Section references break silently — this was demonstrated
# at M5, when the Executive Action Memo moved from execution_pipeline.md §2 to
# §7 while two files still pointed at §2.
#
#   bash docs/validation/check-references.sh
#
# Exits 1 on any failure so it can gate a commit hook or CI step.

set -uo pipefail
FAIL=0

# ---------------------------------------------------------------- sections ---
declare -A MAXSEC
for f in CLAUDE.md core/*.md core/executives/*.md core/onboarding/*.md docs/validation/*.md; do
  [ -e "$f" ] || continue
  # Count "## N." headings, skipping fenced code blocks (which contain
  # illustrative headings that are not real sections).
  MAXSEC["$(basename "$f")"]=$(awk '/^```/{inb=!inb; next} !inb && /^## [0-9]+\./' "$f" | wc -l)
done

echo "=== sections per file ==="
for k in $(printf '%s\n' "${!MAXSEC[@]}" | sort); do
  printf "  %-40s %s\n" "$k" "${MAXSEC[$k]}"
done

# ------------------------------------------------------ reference integrity ---
echo
echo "=== cross-reference integrity ==="
# Matches "<file>.md §N" and "`<file>.md` §N". The filename pattern allows
# dots so business_memory.template.md resolves correctly.
while IFS= read -r hit; do
  loc="${hit%%:*}"
  ref="${hit#*:}"
  target=$(printf '%s' "$ref" | grep -oE '[A-Za-z_.]+\.md')
  sec=$(printf '%s' "$ref" | grep -oE '[0-9]+$')
  max="${MAXSEC[$target]:-}"
  if [ -z "$max" ]; then
    echo "  UNKNOWN TARGET   $loc -> $target §$sec"
    FAIL=1
  elif [ "$sec" -gt "$max" ] || [ "$sec" -lt 1 ]; then
    echo "  BROKEN           $loc -> $target §$sec (file has $max sections)"
    FAIL=1
  fi
#
# FINDINGS.md is excluded, and the reason is not convenience.
#
# It is a dated snapshot — "Validation date: 2026-07-27 · Commit under test:
# a1efb7f" — whose §0 states that the original report is preserved unedited. Its
# references describe the repository as it was at that commit, so checking them
# against the present tree is a category error: the only way to make them
# "resolve" would be to rewrite a historical record, which is the one thing that
# document exists not to do.
#
# This exemption covers dated reports ONLY. Every live document — the kernel,
# core/, .claude/, and the other validation artifacts — is still checked.
done < <(grep -rhoE '[A-Za-z_.]+\.md`? §[0-9]+' --include=*.md \
           --exclude=FINDINGS.md . | sort -u | sed 's/^/ref:/')

[ "$FAIL" -eq 0 ] && echo "  all references resolve"

# ------------------------------------------------------------------- ADRs -----
echo
echo "=== ADR reference validity ==="
for adr in $(grep -rhoE 'ADR-0[0-9]+' --include=*.md . | sort -u); do
  n="${adr#ADR-}"
  if ! grep -qE "^## ADR-$n" docs/DECISIONS.md; then
    echo "  MISSING          $adr cited but not defined in docs/DECISIONS.md"
    FAIL=1
  fi
done
echo "  (no MISSING lines above = all cited ADRs exist)"

# ----------------------------------------------------------- terminology -----
echo
echo "=== terminology drift ==="
# Terms retired by an approved ADR. docs/ may reference them historically;
# CLAUDE.md and core/ may not.
for term in 'business_context' 'Deliberation mode' 'Counsel mode'; do
  if grep -rn "$term" CLAUDE.md core/ .claude/ --include=*.md >/dev/null 2>&1; then
    echo "  STALE TERM       '$term' present in kernel or core/"
    grep -rn "$term" CLAUDE.md core/ .claude/ --include=*.md | sed 's/^/                   /'
    FAIL=1
  fi
done
echo "  (no STALE TERM lines above = clean)"

# ------------------------------------------------- company-agnostic (R-29) ---
echo
echo "=== company-agnostic check (ADR-010) ==="
# System files must contain no company specifics. Extend this list when the
# repository is used for a real company; business_memory.md is gitignored and
# is the only sanctioned location.
for name in 'CITTAA' 'cittaa'; do
  if grep -rni "$name" CLAUDE.md core/ docs/ .claude/ --include=*.md >/dev/null 2>&1; then
    echo "  LEAK             '$name' found in a system file"
    FAIL=1
  fi
done
echo "  (no LEAK lines above = repository is company-agnostic)"

# ------------------------------------------------------------ kernel size ----
echo
echo "=== kernel budget ==="
KW=$(wc -w < CLAUDE.md)
printf "  CLAUDE.md %s words / ~3200 budget\n" "$KW"
if [ "$KW" -gt 3400 ]; then
  echo "  OVER BUDGET      kernel exceeds tolerance; extract mechanics to core/"
  FAIL=1
fi

# ------------------------------------------------- context-per-interaction ---
echo
echo "=== ADR-007 amended bound (<=6 files per interaction) ==="
NLENS=$(ls -1 core/executives/*.md 2>/dev/null | wc -l)
# ADR-012: the gate reads only the manifest, then loads admitted lenses.
# Base = kernel, memory, calibration, reasoning_rules, execution_pipeline, manifest.
BASE=6
FOCUSED_MIN=$((BASE + 1))    # Focused: 1 constructive lens, no challenge pass
FOCUSED_MAX=$((BASE + 2))    # Focused: 2 constructive lenses
FULL_MIN=$((BASE + 4))       # Full: 2 constructive + 2 challenge
FULL_MAX=$((BASE + 6))       # Full: 4 constructive + 2 challenge
echo "  boot:            CLAUDE.md, business_memory.md, calibration_journal.md         (3)"
echo "  routing base:    + reasoning_rules.md, execution_pipeline.md, executive_manifest.md ($BASE)"
echo "  Focused:         + 1-2 admitted lenses                                  ($FOCUSED_MIN-$FOCUSED_MAX)"
echo "  Full:            + 2-4 constructive + 2 challenge                      ($FULL_MIN-$FULL_MAX)"
echo "  writing record:  kernel, memory, calibration, learning_protocol.md            (4)"
echo "                   (execution_pipeline.md excluded by design — the memo already"
echo "                    exists; see learning_protocol.md §2 and ADR-007 amendment 2)"
echo "  $NLENS lens definitions exist; the gate no longer reads them to route (ADR-012)."
if [ "$FULL_MAX" -gt 6 ]; then
  echo "  BREACH:          peak is $FULL_MAX, bound is 6."
  echo "                   ADR-012 cut the peak from 13 to $FULL_MAX by loading only admitted"
  echo "                   lenses, but the routing base alone is already $BASE files — so ANY"
  echo "                   deliberation with 2+ lenses exceeds 6 regardless of manifest design."
  echo "                   The file-count criterion is arithmetically unreachable while"
  echo "                   executives are separate files. See ADR-012 for the measured"
  echo "                   numbers and the recommendation; do NOT silence this by raising"
  echo "                   the bound without an approved amendment."
  FAIL=1
else
  echo "  OK:              peak is $FULL_MAX, bound is 6."
fi

echo
if [ "$FAIL" -eq 0 ]; then
  echo "RESULT: all static checks passed"
else
  echo "RESULT: failures above — see docs/validation/FINDINGS.md for defect format"
fi
exit "$FAIL"
