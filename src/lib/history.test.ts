import { describe, it, expect } from 'vitest';
import { buildHistoryLines } from './history';
import type { AssembledContext } from './context';
import type { MemoryEntry } from './memory';

describe('buildHistoryLines', () => {
  const createContext = (overrides: Partial<AssembledContext> = {}): AssembledContext => ({
    promptText: 'Test prompt',
    renderedHistory: '',
    latestLine: 'Latest message',
    historyEntries: [],
    ...overrides,
  });

  const createMemoryEntry = (overrides: Partial<MemoryEntry> = {}): MemoryEntry => ({
    id: 'entry-1',
    timestamp: '2024-01-15T14:30:00Z',
    speaker: 'confucius',
    recipients: ['laozi'],
    message: 'Hello, friend',
    phase: 'introduce',
    ...overrides,
  });

  describe('structured history entries mode', () => {
    it('should use historyEntries when available', () => {
      const entry1 = createMemoryEntry({ id: 'msg-1', message: 'First message' });
      const entry2 = createMemoryEntry({ id: 'msg-2', message: 'Second message' });

      const context = createContext({
        historyEntries: [entry1, entry2],
      });

      const result = buildHistoryLines(context, 'synthesis');

      expect(result).toHaveLength(2);
      expect(result[0]?.message).toBe('First message');
      expect(result[1]?.message).toBe('Second message');
    });

    it('should preserve entry IDs', () => {
      const entry = createMemoryEntry({ id: 'msg-123', message: 'Test' });
      const context = createContext({ historyEntries: [entry] });

      const result = buildHistoryLines(context, 'introduce');

      expect(result[0]?.id).toBe('msg-123');
    });

    it('should generate ID when entry.id is missing', () => {
      const entry = createMemoryEntry({
        id: undefined as unknown as string,
        timestamp: '2024-01-15T14:30:00Z',
        speaker: 'confucius',
      });
      const context = createContext({ historyEntries: [entry] });

      const result = buildHistoryLines(context, 'introduce');

      expect(result[0]?.id).toBe('history-2024-01-15T14:30:00Z-confucius');
    });

    it('should preserve entry timestamps', () => {
      const entry = createMemoryEntry({ timestamp: '2024-06-15T10:30:00Z' });
      const context = createContext({ historyEntries: [entry] });

      const result = buildHistoryLines(context, 'introduce');

      expect(result[0]?.timestamp).toBe('2024-06-15T10:30:00Z');
    });

    it('should preserve entry speakers', () => {
      const entry1 = createMemoryEntry({ speaker: 'confucius' });
      const entry2 = createMemoryEntry({ speaker: 'laozi' });
      const context = createContext({ historyEntries: [entry1, entry2] });

      const result = buildHistoryLines(context, 'introduce');

      expect(result[0]?.speaker).toBe('confucius');
      expect(result[1]?.speaker).toBe('laozi');
    });

    it('should use entry phase when available', () => {
      const entry = createMemoryEntry({ phase: 'synthesis' });
      const context = createContext({ historyEntries: [entry] });

      const result = buildHistoryLines(context, 'introduce');

      expect(result[0]?.phase).toBe('synthesis');
    });

    it('should use fallback phase when entry phase is missing', () => {
      const entry = createMemoryEntry({ phase: undefined as unknown as 'introduce' });
      const context = createContext({ historyEntries: [entry] });

      const result = buildHistoryLines(context, 'cross-response');

      expect(result[0]?.phase).toBe('cross-response');
    });

    it('should handle empty historyEntries array', () => {
      const context = createContext({
        historyEntries: [],
        renderedHistory: '[2024-01-15T14:30:00Z] confucius → laozi:: Hello',
      });

      const result = buildHistoryLines(context, 'introduce');

      // Should fall back to parsing renderedHistory
      expect(result).toHaveLength(1);
      expect(result[0]?.message).toBe('Hello');
    });

    it('should handle multiple entries with different phases', () => {
      const entries = [
        createMemoryEntry({ id: '1', phase: 'introduce' }),
        createMemoryEntry({ id: '2', phase: 'cross-response' }),
        createMemoryEntry({ id: '3', phase: 'synthesis' }),
      ];
      const context = createContext({ historyEntries: entries });

      const result = buildHistoryLines(context, 'introduce');

      expect(result[0]?.phase).toBe('introduce');
      expect(result[1]?.phase).toBe('cross-response');
      expect(result[2]?.phase).toBe('synthesis');
    });
  });

  describe('rendered history parsing mode', () => {
    it('should parse single line correctly', () => {
      const context = createContext({
        renderedHistory: '[2024-01-15T14:30:00Z] confucius → laozi:: Hello, friend',
      });

      const result = buildHistoryLines(context, 'introduce');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'history-0-2024-01-15T14:30:00Z',
        timestamp: '2024-01-15T14:30:00Z',
        speaker: 'confucius',
        message: 'Hello, friend',
        phase: 'introduce',
      });
    });

    it('should parse multiple lines', () => {
      const context = createContext({
        renderedHistory: `[2024-01-15T14:30:00Z] confucius → laozi:: First message
[2024-01-15T14:31:00Z] laozi → confucius:: Second message
[2024-01-15T14:32:00Z] mencius → all:: Third message`,
      });

      const result = buildHistoryLines(context, 'cross-response');

      expect(result).toHaveLength(3);
      expect(result[0]?.message).toBe('First message');
      expect(result[1]?.message).toBe('Second message');
      expect(result[2]?.message).toBe('Third message');
    });

    it('should skip invalid lines', () => {
      const context = createContext({
        renderedHistory: `[2024-01-15T14:30:00Z] confucius → laozi:: Valid
Invalid line format
[2024-01-15T14:31:00Z] laozi → confucius:: Also valid`,
      });

      const result = buildHistoryLines(context, 'introduce');

      expect(result).toHaveLength(2);
      expect(result[0]?.message).toBe('Valid');
      expect(result[1]?.message).toBe('Also valid');
    });

    it('should handle empty renderedHistory', () => {
      const context = createContext({ renderedHistory: '' });

      const result = buildHistoryLines(context, 'introduce');

      expect(result).toEqual([]);
    });

    it('should handle renderedHistory with only whitespace', () => {
      const context = createContext({ renderedHistory: '   \n\n   \t   ' });

      const result = buildHistoryLines(context, 'introduce');

      expect(result).toEqual([]);
    });

    it('should trim whitespace from parsed values', () => {
      const context = createContext({
        renderedHistory: '[  2024-01-15T14:30:00Z  ] confucius   →   laozi  ::   Message with spaces   ',
      });

      const result = buildHistoryLines(context, 'introduce');

      expect(result[0]?.timestamp).toBe('2024-01-15T14:30:00Z');
      expect(result[0]?.speaker).toBe('confucius');
      expect(result[0]?.message).toBe('Message with spaces');
    });

    it('should generate incremental IDs based on line index', () => {
      const context = createContext({
        renderedHistory: `[2024-01-15T14:30:00Z] confucius → laozi:: First
[2024-01-15T14:31:00Z] laozi → confucius:: Second
[2024-01-15T14:32:00Z] mencius → all:: Third`,
      });

      const result = buildHistoryLines(context, 'introduce');

      expect(result[0]?.id).toBe('history-0-2024-01-15T14:30:00Z');
      expect(result[1]?.id).toBe('history-1-2024-01-15T14:31:00Z');
      expect(result[2]?.id).toBe('history-2-2024-01-15T14:32:00Z');
    });

    it('should use fallback phase for all parsed entries', () => {
      const context = createContext({
        renderedHistory: `[2024-01-15T14:30:00Z] confucius → laozi:: First
[2024-01-15T14:31:00Z] laozi → confucius:: Second`,
      });

      const result = buildHistoryLines(context, 'synthesis');

      expect(result[0]?.phase).toBe('synthesis');
      expect(result[1]?.phase).toBe('synthesis');
    });

    it('should handle messages with special characters', () => {
      const context = createContext({
        renderedHistory: '[2024-01-15T14:30:00Z] confucius → laozi:: Message with "quotes" and \'apostrophes\'',
      });

      const result = buildHistoryLines(context, 'introduce');

      expect(result[0]?.message).toBe('Message with "quotes" and \'apostrophes\'');
    });

    it('should handle messages with colons', () => {
      const context = createContext({
        renderedHistory: '[2024-01-15T14:30:00Z] confucius → laozi:: The way is: truth and virtue',
      });

      const result = buildHistoryLines(context, 'introduce');

      expect(result[0]?.message).toBe('The way is: truth and virtue');
    });

    it('should handle messages on single line only', () => {
      const context = createContext({
        renderedHistory: `[2024-01-15T14:30:00Z] confucius → laozi:: First line
[2024-01-15T14:31:00Z] laozi → confucius:: Second line`,
      });

      const result = buildHistoryLines(context, 'introduce');

      // Parser splits by newline first, so each line is separate
      expect(result).toHaveLength(2);
      expect(result[0]?.message).toBe('First line');
      expect(result[1]?.message).toBe('Second line');
    });

    it('should skip lines missing timestamp', () => {
      const context = createContext({
        renderedHistory: '[] confucius → laozi:: Missing timestamp',
      });

      const result = buildHistoryLines(context, 'introduce');

      expect(result).toEqual([]);
    });

    it('should allow whitespace-only speaker (trimmed to empty)', () => {
      // Note: This is a quirk of the implementation - validation happens before trim
      const context = createContext({
        renderedHistory: '[2024-01-15T14:30:00Z]  → laozi:: Message',
      });

      const result = buildHistoryLines(context, 'introduce');

      expect(result).toHaveLength(1);
      expect(result[0]?.speaker).toBe(''); // Whitespace trimmed to empty
    });

    it('should skip lines missing message', () => {
      const context = createContext({
        renderedHistory: '[2024-01-15T14:30:00Z] confucius → laozi:: ',
      });

      const result = buildHistoryLines(context, 'introduce');

      expect(result).toEqual([]);
    });

    it('should handle various timestamp formats', () => {
      const context = createContext({
        renderedHistory: `[2024-01-15T14:30:00.123Z] confucius → laozi:: With milliseconds
[2024-01-15T14:30:00+05:00] laozi → confucius:: With timezone`,
      });

      const result = buildHistoryLines(context, 'introduce');

      expect(result).toHaveLength(2);
      expect(result[0]?.timestamp).toBe('2024-01-15T14:30:00.123Z');
      expect(result[1]?.timestamp).toBe('2024-01-15T14:30:00+05:00');
    });
  });

  describe('fallback behavior', () => {
    it('should prefer historyEntries over renderedHistory', () => {
      const entry = createMemoryEntry({ id: 'struct-1', message: 'From structured' });
      const context = createContext({
        historyEntries: [entry],
        renderedHistory: '[2024-01-15T14:30:00Z] confucius → laozi:: From rendered',
      });

      const result = buildHistoryLines(context, 'introduce');

      expect(result).toHaveLength(1);
      expect(result[0]?.message).toBe('From structured');
      expect(result[0]?.id).toBe('struct-1');
    });

    it('should use renderedHistory when historyEntries is empty', () => {
      const context = createContext({
        historyEntries: [],
        renderedHistory: '[2024-01-15T14:30:00Z] confucius → laozi:: From rendered',
      });

      const result = buildHistoryLines(context, 'introduce');

      expect(result[0]?.message).toBe('From rendered');
    });

    it('should use renderedHistory when historyEntries is missing', () => {
      const context = createContext({
        historyEntries: undefined as unknown as [],
        renderedHistory: '[2024-01-15T14:30:00Z] confucius → laozi:: From rendered',
      });

      const result = buildHistoryLines(context, 'introduce');

      expect(result[0]?.message).toBe('From rendered');
    });
  });

  describe('edge cases', () => {
    it('should handle very long messages', () => {
      const longMessage = 'A'.repeat(5000);
      const entry = createMemoryEntry({ message: longMessage });
      const context = createContext({ historyEntries: [entry] });

      const result = buildHistoryLines(context, 'introduce');

      expect(result[0]?.message).toBe(longMessage);
      expect(result[0]?.message.length).toBe(5000);
    });

    it('should handle large number of entries', () => {
      const entries = Array.from({ length: 100 }, (_, i) =>
        createMemoryEntry({ id: `msg-${i}`, message: `Message ${i}` })
      );
      const context = createContext({ historyEntries: entries });

      const result = buildHistoryLines(context, 'introduce');

      expect(result).toHaveLength(100);
      expect(result[0]?.message).toBe('Message 0');
      expect(result[99]?.message).toBe('Message 99');
    });

    it('should handle speaker names with special characters', () => {
      const entry = createMemoryEntry({ speaker: 'philosopher-123_test' });
      const context = createContext({ historyEntries: [entry] });

      const result = buildHistoryLines(context, 'introduce');

      expect(result[0]?.speaker).toBe('philosopher-123_test');
    });

    it('should maintain order of entries', () => {
      const entries = [
        createMemoryEntry({ id: '1', message: 'First' }),
        createMemoryEntry({ id: '2', message: 'Second' }),
        createMemoryEntry({ id: '3', message: 'Third' }),
      ];
      const context = createContext({ historyEntries: entries });

      const result = buildHistoryLines(context, 'introduce');

      expect(result.map(r => r.message)).toEqual(['First', 'Second', 'Third']);
    });
  });
});
