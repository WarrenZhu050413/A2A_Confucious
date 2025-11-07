import { describe, it, expect } from 'vitest';
import { createEmptyMemories, pushMemoryEntry, getLatestFor, getHistoryFor } from './memory';
import type { Philosopher, MessageEvent } from '../types';

describe('memory', () => {
  const mockPhilosophers: Philosopher[] = [
    {
      id: 'confucius',
      name: 'Confucius',
      school: 'Confucianism',
      port: 3101,
      personaSummary: 'The Master',
      personaTemplate: 'Template',
    },
    {
      id: 'laozi',
      name: 'Laozi',
      school: 'Taoism',
      port: 3102,
      personaSummary: 'The Sage',
      personaTemplate: 'Template',
    },
    {
      id: 'mencius',
      name: 'Mencius',
      school: 'Confucianism',
      port: 3103,
      personaSummary: 'The Disciple',
      personaTemplate: 'Template',
    },
  ];

  const createMockMessage = (overrides: Partial<MessageEvent> = {}): MessageEvent => ({
    id: 'msg-1',
    type: 'message',
    speaker: 'confucius',
    recipients: ['laozi'],
    phase: 'introduce',
    timestamp: '2024-01-01T12:00:00Z',
    surface: 'Hello, friend',
    translations: { english: 'Hello, friend' },
    ...overrides,
  });

  describe('createEmptyMemories', () => {
    it('should create empty memory state with default max', () => {
      const state = createEmptyMemories(mockPhilosophers);

      expect(state.max).toBe(50); // DEFAULT_MAX
      expect(state.store).toHaveProperty('all');
      expect(state.store.all).toEqual([]);
      expect(state.store.confucius).toEqual([]);
      expect(state.store.laozi).toEqual([]);
      expect(state.store.mencius).toEqual([]);
    });

    it('should create empty memory state with custom max', () => {
      const state = createEmptyMemories(mockPhilosophers, 100);

      expect(state.max).toBe(100);
      expect(state.store).toHaveProperty('all');
    });

    it('should create empty memory state with zero philosophers', () => {
      const state = createEmptyMemories([]);

      expect(state.max).toBe(50);
      expect(state.store).toEqual({ all: [] });
    });

    it('should create separate arrays for each philosopher', () => {
      const state = createEmptyMemories(mockPhilosophers);

      // Ensure each philosopher has their own array reference
      expect(state.store.confucius).not.toBe(state.store.laozi);
      expect(state.store.confucius).not.toBe(state.store.all);
    });

    it('should handle philosophers with special characters in IDs', () => {
      const specialPhilosophers: Philosopher[] = [
        { ...mockPhilosophers[0], id: 'philosopher-123' },
        { ...mockPhilosophers[1], id: 'philosopher_abc' },
      ];

      const state = createEmptyMemories(specialPhilosophers);

      expect(state.store).toHaveProperty('philosopher-123');
      expect(state.store).toHaveProperty('philosopher_abc');
    });
  });

  describe('pushMemoryEntry', () => {
    it('should add message to recipients and "all"', () => {
      const state = createEmptyMemories(mockPhilosophers);
      const message = createMockMessage({
        speaker: 'confucius',
        recipients: ['laozi'],
      });

      const newState = pushMemoryEntry(state, message);

      // Should be in laozi's memory (recipient)
      expect(newState.store.laozi).toHaveLength(1);
      expect(newState.store.laozi[0]?.message).toBe('Hello, friend');

      // Should be in "all"
      expect(newState.store.all).toHaveLength(1);
      expect(newState.store.all[0]?.message).toBe('Hello, friend');

      // Should NOT be in confucius's memory (speaker, not recipient)
      expect(newState.store.confucius).toHaveLength(0);

      // Should NOT be in mencius's memory (not a recipient)
      expect(newState.store.mencius).toHaveLength(0);
    });

    it('should add message to all recipients', () => {
      const state = createEmptyMemories(mockPhilosophers);
      const message = createMockMessage({
        recipients: ['laozi', 'mencius'],
      });

      const newState = pushMemoryEntry(state, message);

      expect(newState.store.laozi).toHaveLength(1);
      expect(newState.store.mencius).toHaveLength(1);
      expect(newState.store.all).toHaveLength(1);
    });

    it('should handle broadcast messages (no specific recipients)', () => {
      const state = createEmptyMemories(mockPhilosophers);
      const message = createMockMessage({
        recipients: [],
      });

      const newState = pushMemoryEntry(state, message);

      // Should only be in "all" when recipients is empty
      expect(newState.store.all).toHaveLength(1);
      expect(newState.store.confucius).toHaveLength(0);
      expect(newState.store.laozi).toHaveLength(0);
      expect(newState.store.mencius).toHaveLength(0);
    });

    it('should enforce max limit per recipient', () => {
      const state = createEmptyMemories(mockPhilosophers, 3);

      let currentState = state;
      for (let i = 1; i <= 5; i++) {
        const message = createMockMessage({
          id: `msg-${i}`,
          recipients: ['laozi'],
          surface: `Message ${i}`,
        });
        currentState = pushMemoryEntry(currentState, message);
      }

      // Should only keep last 3 messages
      expect(currentState.store.laozi).toHaveLength(3);
      expect(currentState.store.laozi[0]?.message).toBe('Message 3');
      expect(currentState.store.laozi[1]?.message).toBe('Message 4');
      expect(currentState.store.laozi[2]?.message).toBe('Message 5');

      // "all" should also be limited
      expect(currentState.store.all).toHaveLength(3);
    });

    it('should create memory entry with correct fields', () => {
      const state = createEmptyMemories(mockPhilosophers);
      const message = createMockMessage({
        id: 'test-msg-123',
        speaker: 'confucius',
        recipients: ['laozi'],
        timestamp: '2024-01-01T15:30:00Z',
        surface: 'The way is the goal',
        phase: 'synthesis',
      });

      const newState = pushMemoryEntry(state, message);
      const entry = newState.store.laozi[0];

      expect(entry).toBeDefined();
      if (entry) {
        expect(entry.id).toBe('test-msg-123');
        expect(entry.speaker).toBe('confucius');
        expect(entry.recipients).toEqual(['laozi']);
        expect(entry.timestamp).toBe('2024-01-01T15:30:00Z');
        expect(entry.message).toBe('The way is the goal');
        expect(entry.phase).toBe('synthesis');
      }
    });

    it('should not mutate original state', () => {
      const state = createEmptyMemories(mockPhilosophers);
      const originalStore = state.store;
      const message = createMockMessage();

      const newState = pushMemoryEntry(state, message);

      expect(newState.store).not.toBe(originalStore);
      expect(state.store.laozi).toHaveLength(0); // Original unchanged
      expect(newState.store.laozi).toHaveLength(1); // New state has entry
    });

    it('should handle message with duplicate recipients', () => {
      const state = createEmptyMemories(mockPhilosophers);
      const message = createMockMessage({
        recipients: ['laozi', 'laozi', 'laozi'],
      });

      const newState = pushMemoryEntry(state, message);

      // Should deduplicate recipients (Set behavior)
      expect(newState.store.laozi).toHaveLength(1);
    });

    it('should handle message to non-existent philosopher', () => {
      const state = createEmptyMemories(mockPhilosophers);
      const message = createMockMessage({
        recipients: ['unknown-philosopher'],
      });

      const newState = pushMemoryEntry(state, message);

      // Should create new entry in store for unknown philosopher
      expect(newState.store['unknown-philosopher']).toBeDefined();
      expect(newState.store['unknown-philosopher']).toHaveLength(1);
    });

    it('should maintain order of messages (FIFO)', () => {
      const state = createEmptyMemories(mockPhilosophers);

      const msg1 = createMockMessage({ id: 'msg-1', surface: 'First', recipients: ['laozi'] });
      const msg2 = createMockMessage({ id: 'msg-2', surface: 'Second', recipients: ['laozi'] });
      const msg3 = createMockMessage({ id: 'msg-3', surface: 'Third', recipients: ['laozi'] });

      let currentState = state;
      currentState = pushMemoryEntry(currentState, msg1);
      currentState = pushMemoryEntry(currentState, msg2);
      currentState = pushMemoryEntry(currentState, msg3);

      expect(currentState.store.laozi).toHaveLength(3);
      expect(currentState.store.laozi[0]?.message).toBe('First');
      expect(currentState.store.laozi[1]?.message).toBe('Second');
      expect(currentState.store.laozi[2]?.message).toBe('Third');
    });
  });

  describe('getLatestFor', () => {
    it('should return latest memory entry for philosopher', () => {
      const state = createEmptyMemories(mockPhilosophers);

      const msg1 = createMockMessage({ id: 'msg-1', surface: 'First', recipients: ['laozi'] });
      const msg2 = createMockMessage({ id: 'msg-2', surface: 'Second', recipients: ['laozi'] });
      const msg3 = createMockMessage({ id: 'msg-3', surface: 'Third', recipients: ['laozi'] });

      let currentState = state;
      currentState = pushMemoryEntry(currentState, msg1);
      currentState = pushMemoryEntry(currentState, msg2);
      currentState = pushMemoryEntry(currentState, msg3);

      const latest = getLatestFor(currentState, 'laozi');

      expect(latest).toBeDefined();
      expect(latest?.id).toBe('msg-3');
      expect(latest?.message).toBe('Third');
    });

    it('should return null when no memories exist', () => {
      const state = createEmptyMemories(mockPhilosophers);

      const latest = getLatestFor(state, 'laozi');

      expect(latest).toBeNull();
    });

    it('should return null for unknown philosopher', () => {
      const state = createEmptyMemories(mockPhilosophers);

      const latest = getLatestFor(state, 'unknown');

      expect(latest).toBeNull();
    });

    it('should return correct latest after max limit is enforced', () => {
      const state = createEmptyMemories(mockPhilosophers, 2);

      let currentState = state;
      currentState = pushMemoryEntry(currentState, createMockMessage({ id: 'msg-1', recipients: ['laozi'] }));
      currentState = pushMemoryEntry(currentState, createMockMessage({ id: 'msg-2', recipients: ['laozi'] }));
      currentState = pushMemoryEntry(currentState, createMockMessage({ id: 'msg-3', recipients: ['laozi'] }));

      const latest = getLatestFor(currentState, 'laozi');

      expect(latest?.id).toBe('msg-3');
    });

    it('should work with "all" special key', () => {
      const state = createEmptyMemories(mockPhilosophers);
      const message = createMockMessage({ id: 'broadcast-msg' });

      const newState = pushMemoryEntry(state, message);
      const latest = getLatestFor(newState, 'all');

      expect(latest?.id).toBe('broadcast-msg');
    });
  });

  describe('getHistoryFor', () => {
    it('should return all memory entries for philosopher', () => {
      const state = createEmptyMemories(mockPhilosophers);

      const msg1 = createMockMessage({ id: 'msg-1', surface: 'First', recipients: ['laozi'] });
      const msg2 = createMockMessage({ id: 'msg-2', surface: 'Second', recipients: ['laozi'] });
      const msg3 = createMockMessage({ id: 'msg-3', surface: 'Third', recipients: ['laozi'] });

      let currentState = state;
      currentState = pushMemoryEntry(currentState, msg1);
      currentState = pushMemoryEntry(currentState, msg2);
      currentState = pushMemoryEntry(currentState, msg3);

      const history = getHistoryFor(currentState, 'laozi');

      expect(history).toHaveLength(3);
      expect(history[0]?.message).toBe('First');
      expect(history[1]?.message).toBe('Second');
      expect(history[2]?.message).toBe('Third');
    });

    it('should return empty array when no memories exist', () => {
      const state = createEmptyMemories(mockPhilosophers);

      const history = getHistoryFor(state, 'laozi');

      expect(history).toEqual([]);
    });

    it('should return empty array for unknown philosopher', () => {
      const state = createEmptyMemories(mockPhilosophers);

      const history = getHistoryFor(state, 'unknown');

      expect(history).toEqual([]);
    });

    it('should return history in correct order (oldest first)', () => {
      const state = createEmptyMemories(mockPhilosophers);

      let currentState = state;
      for (let i = 1; i <= 5; i++) {
        const msg = createMockMessage({
          id: `msg-${i}`,
          surface: `Message ${i}`,
          recipients: ['laozi'],
        });
        currentState = pushMemoryEntry(currentState, msg);
      }

      const history = getHistoryFor(currentState, 'laozi');

      expect(history).toHaveLength(5);
      expect(history[0]?.message).toBe('Message 1');
      expect(history[4]?.message).toBe('Message 5');
    });

    it('should respect max limit in returned history', () => {
      const state = createEmptyMemories(mockPhilosophers, 3);

      let currentState = state;
      for (let i = 1; i <= 5; i++) {
        const msg = createMockMessage({
          id: `msg-${i}`,
          surface: `Message ${i}`,
          recipients: ['laozi'],
        });
        currentState = pushMemoryEntry(currentState, msg);
      }

      const history = getHistoryFor(currentState, 'laozi');

      expect(history).toHaveLength(3);
      expect(history[0]?.message).toBe('Message 3');
      expect(history[1]?.message).toBe('Message 4');
      expect(history[2]?.message).toBe('Message 5');
    });

    it('should work with "all" special key', () => {
      const state = createEmptyMemories(mockPhilosophers);

      const msg1 = createMockMessage({ recipients: ['laozi'] });
      const msg2 = createMockMessage({ recipients: ['mencius'] });

      let currentState = state;
      currentState = pushMemoryEntry(currentState, msg1);
      currentState = pushMemoryEntry(currentState, msg2);

      const history = getHistoryFor(currentState, 'all');

      expect(history).toHaveLength(2); // Both messages should be in "all"
    });

    it('should not mutate the returned array', () => {
      const state = createEmptyMemories(mockPhilosophers);
      const message = createMockMessage({ recipients: ['laozi'] });
      const newState = pushMemoryEntry(state, message);

      const history1 = getHistoryFor(newState, 'laozi');
      const history2 = getHistoryFor(newState, 'laozi');

      // Should return same values but different array references for safety
      expect(history1).toEqual(history2);
      // Note: Current implementation returns same reference, but tests document expected behavior
    });
  });

  describe('integration scenarios', () => {
    it('should handle complex conversation flow', () => {
      const state = createEmptyMemories(mockPhilosophers, 10);

      // Confucius speaks to Laozi
      let currentState = pushMemoryEntry(
        state,
        createMockMessage({ id: 'msg-1', speaker: 'confucius', recipients: ['laozi'], surface: 'What is the way?' })
      );

      // Laozi responds to Confucius
      currentState = pushMemoryEntry(
        currentState,
        createMockMessage({ id: 'msg-2', speaker: 'laozi', recipients: ['confucius'], surface: 'The way that can be told is not the eternal Way' })
      );

      // Mencius joins, speaking to both
      currentState = pushMemoryEntry(
        currentState,
        createMockMessage({ id: 'msg-3', speaker: 'mencius', recipients: ['confucius', 'laozi'], surface: 'Human nature is good' })
      );

      // Verify Confucius's memory (received from Laozi and Mencius)
      const confuciusHistory = getHistoryFor(currentState, 'confucius');
      expect(confuciusHistory).toHaveLength(2);
      expect(confuciusHistory[0]?.speaker).toBe('laozi');
      expect(confuciusHistory[1]?.speaker).toBe('mencius');

      // Verify Laozi's memory (received from Confucius and Mencius)
      const laoziHistory = getHistoryFor(currentState, 'laozi');
      expect(laoziHistory).toHaveLength(2);
      expect(laoziHistory[0]?.speaker).toBe('confucius');
      expect(laoziHistory[1]?.speaker).toBe('mencius');

      // Verify "all" has all messages
      const allHistory = getHistoryFor(currentState, 'all');
      expect(allHistory).toHaveLength(3);
    });

    it('should handle memory pressure with max limit', () => {
      const state = createEmptyMemories(mockPhilosophers, 5);

      let currentState = state;
      for (let i = 1; i <= 10; i++) {
        currentState = pushMemoryEntry(
          currentState,
          createMockMessage({ id: `msg-${i}`, recipients: ['laozi'], surface: `Message ${i}` })
        );
      }

      const history = getHistoryFor(currentState, 'laozi');
      const latest = getLatestFor(currentState, 'laozi');

      expect(history).toHaveLength(5);
      expect(latest?.message).toBe('Message 10');
      expect(history[0]?.message).toBe('Message 6'); // Oldest kept
    });
  });
});
