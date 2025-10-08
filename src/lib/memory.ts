import { Philosopher, MessageEvent } from '../types';

export type MemoryEntry = {
  id: string;
  timestamp: string;
  speaker: string;
  recipients: string[];
  message: string;
  phase: MessageEvent['phase'];
};

export type MemoryState = {
  max: number;
  store: Record<string, MemoryEntry[]>;
};

const DEFAULT_MAX = 50;

export const createEmptyMemories = (
  philosophers: readonly Philosopher[],
  max: number = DEFAULT_MAX,
): MemoryState => {
  const store: Record<string, MemoryEntry[]> = { all: [] };
  philosophers.forEach(philosopher => {
    store[philosopher.id] = [];
  });
  return { max, store };
};

export const pushMemoryEntry = (state: MemoryState, message: MessageEvent): MemoryState => {
  const entry: MemoryEntry = {
    id: message.id,
    timestamp: message.timestamp,
    speaker: message.speaker,
    recipients: message.recipients,
    message: message.surface,
    phase: message.phase,
  };

  const targets = new Set<string>(message.recipients.length ? message.recipients : []);
  targets.add('all');

  const store: Record<string, MemoryEntry[]> = { ...state.store };
  targets.forEach(target => {
    const current = store[target] ?? [];
    store[target] = [...current, entry].slice(-state.max);
  });

  return { ...state, store };
};

export const getLatestFor = (state: MemoryState, philosopherId: string): MemoryEntry | null => {
  const list = state.store[philosopherId];
  if (!list || list.length === 0) return null;
  return list[list.length - 1];
};

export const getHistoryFor = (state: MemoryState, philosopherId: string): MemoryEntry[] => {
  return state.store[philosopherId] ?? [];
};
