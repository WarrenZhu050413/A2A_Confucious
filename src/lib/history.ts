/**
 * History Builder
 *
 * Converts assembled context into structured history lines for display and logging.
 */

import type { Phase } from '../types';
import type { AssembledContext } from './context';

export interface HistoryLine {
  id: string;
  timestamp: string;
  speaker: string;
  message: string;
  phase: Phase;
}

/**
 * Builds structured history lines from assembled context.
 *
 * Attempts to use structured historyEntries if available, otherwise
 * parses the rendered history string format.
 *
 * @param context - Assembled context containing history data
 * @param fallbackPhase - Phase to use if not specified in history entries
 * @returns Array of structured history lines
 */
export const buildHistoryLines = (
  context: AssembledContext,
  fallbackPhase: Phase,
): HistoryLine[] => {
  // Prefer structured history entries if available
  if (context.historyEntries && context.historyEntries.length) {
    return context.historyEntries.map((entry) => ({
      id: entry.id ?? `history-${entry.timestamp}-${entry.speaker}`,
      timestamp: entry.timestamp,
      speaker: entry.speaker,
      message: entry.message,
      phase: entry.phase ?? fallbackPhase,
    }));
  }

  // Fallback: parse rendered history string
  // Format: [timestamp] speaker → recipient:: message
  return context.renderedHistory
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const match = line.match(/^[[]([^\]]+)][\s]+([^→]+)→[\s]+([^:]+)::[\s]+([\s\S]+)$/);
      if (!match) {
        return null;
      }
      const [, timestamp, speaker, , surface] = match;
      return {
        id: `history-${index}-${timestamp}`,
        timestamp: timestamp.trim(),
        speaker: speaker.trim(),
        message: surface.trim(),
        phase: fallbackPhase,
      };
    })
    .filter((entry): entry is HistoryLine => Boolean(entry));
};
