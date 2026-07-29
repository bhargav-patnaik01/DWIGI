'use client';

import { useMemo } from 'react';
import type { ExecutiveLens } from '@shared/repo';
import {
  councilMode,
  DEFAULT_COUNCIL_MODE,
  MIN_ENABLED_LENSES,
  type CouncilMode,
} from '@shared/runtime-modes';
import { useRepo } from '@/lib/store/repo';
import { useUi } from '@/lib/store/ui';

export { MIN_ENABLED_LENSES };

/**
 * Derived views over the projected executive matrix.
 *
 * ---------------------------------------------------------------------------
 * DERIVATION, NOT AUTHORSHIP
 * ---------------------------------------------------------------------------
 * Everything below is a function of two inputs: the lens roster projected from
 * `core/executive_matrix.md`, and the founder's own enable/disable choices. No
 * lens is named in this file, and no rule about what a lens does is encoded
 * here. If the matrix loses a lens, it disappears from the interface; if it
 * gains one, the interface offers it without a code change.
 *
 * The one piece of policy that does live here is the deliberation floor, and it
 * is a restatement of `core/reasoning_rules.md` §1 rather than a new rule.
 */

export interface ExecutiveRoster {
  /** Every lens the matrix defines, in the file's own order. */
  all: ExecutiveLens[];
  /**
   * Lenses that build recommendations at S4 and can therefore be configured.
   *
   * Identified by the matrix marking them *not* structural — the interface reads
   * that from the file rather than deciding it.
   */
  constructive: ExecutiveLens[];
  /**
   * Lenses the matrix declares structural at S5.
   *
   * Displayed, never toggled. `executive_matrix.md` §7 and §8 make them
   * non-suppressible at Full and Maximum budget, so a toggle for them would be
   * decorative — it would appear to do something the engine would ignore.
   */
  structural: ExecutiveLens[];
  /** Reason the roster is unavailable, or null when it projected cleanly. */
  unavailable: string | null;
}

export function useExecutiveRoster(): ExecutiveRoster {
  const snapshot = useRepo((s) => s.snapshot);

  return useMemo(() => {
    const projection = snapshot?.executives;

    if (!projection) {
      return {
        all: [],
        constructive: [],
        structural: [],
        unavailable: 'No repository is attached.',
      };
    }

    if (!projection.ok) {
      return { all: [], constructive: [], structural: [], unavailable: projection.reason };
    }

    const all = projection.value.lenses;
    return {
      all,
      constructive: all.filter((lens) => !lens.structural),
      structural: all.filter((lens) => lens.structural),
      unavailable: null,
    };
  }, [snapshot]);
}

export interface CouncilConfig extends ExecutiveRoster {
  /** Ids currently engaged for Council deliberation. */
  enabled: Set<string>;
  /** True while the founder has changed nothing and the engine routes freely. */
  isDefault: boolean;
  /** True when disabling one more would breach the deliberation floor. */
  atFloor: boolean;
  /**
   * The mode a Council turn should be sent with.
   *
   * `DEFAULT_COUNCIL_MODE` while unconfigured, which composes no directive — an
   * untouched cockpit sends the founder's bytes and nothing else.
   */
  mode: CouncilMode;
  /** Is this lens engaged for Council deliberation? */
  isEnabled(lensId: string): boolean;
}

/**
 * Resolve the founder's Agent Management configuration against the live roster.
 *
 * Stored ids are intersected with what the matrix currently defines, so a lens
 * removed from the matrix cannot linger in a directive, and a lens added to it
 * is enabled by default rather than silently excluded by an old preference.
 */
export function useCouncilConfig(): CouncilConfig {
  const roster = useExecutiveRoster();
  const stored = useUi((s) => s.enabledLenses);

  return useMemo(() => {
    const availableIds = roster.constructive.map((lens) => lens.id);

    const enabled = new Set(
      stored === null ? availableIds : availableIds.filter((id) => stored.includes(id))
    );

    const isDefault = stored === null || enabled.size === availableIds.length;

    return {
      ...roster,
      enabled,
      isDefault,
      atFloor: enabled.size <= MIN_ENABLED_LENSES,
      mode: isDefault ? DEFAULT_COUNCIL_MODE : councilMode([...enabled], availableIds),
      isEnabled: (lensId: string) => enabled.has(lensId),
    };
  }, [roster, stored]);
}

/** Find one lens by id, or null. Used to title and label a single-agent chat. */
export function useExecutive(lensId: string | null): ExecutiveLens | null {
  const { all } = useExecutiveRoster();
  return useMemo(
    () => (lensId ? (all.find((lens) => lens.id === lensId) ?? null) : null),
    [all, lensId]
  );
}
