import type { UIState } from './types.js';
import { Logger } from '../logger.js';

const log = new Logger({ prefix: 'Dedup' });

export interface DeduplicationResult {
  uniqueStates: UIState[];
  duplicateGroups: Map<string, UIState[]>;
  totalOriginal: number;
  totalUnique: number;
}

/**
 * Deduplicate UI states by fingerprint.
 * For each fingerprint group, keeps the state reached with the fewest actions
 * (shallowest exploration path).
 */
export function deduplicateStates(states: UIState[]): DeduplicationResult {
  const groups = new Map<string, UIState[]>();

  for (const state of states) {
    const existing = groups.get(state.fingerprint);
    if (existing) {
      existing.push(state);
    } else {
      groups.set(state.fingerprint, [state]);
    }
  }

  const uniqueStates: UIState[] = [];
  const duplicateGroups = new Map<string, UIState[]>();

  for (const [fingerprint, group] of groups) {
    // Keep the shallowest (fewest actions to reach) as representative
    group.sort((a, b) => a.actionsToReach.length - b.actionsToReach.length);
    const representative = group[0]!;
    uniqueStates.push(representative);

    if (group.length > 1) {
      duplicateGroups.set(fingerprint, group.slice(1));
    }
  }

  const result: DeduplicationResult = {
    uniqueStates,
    duplicateGroups,
    totalOriginal: states.length,
    totalUnique: uniqueStates.length,
  };

  log.info(
    `${states.length} states → ${uniqueStates.length} unique (${states.length - uniqueStates.length} duplicates removed)`
  );

  return result;
}
