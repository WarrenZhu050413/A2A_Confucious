import { describe, it, expect } from 'vitest';
import { assembleContextForPhilosopher } from './context';
import { createEmptyMemories, pushMemoryEntry } from './memory';
import type { Philosopher, MessageEvent } from '../types';
import type { MemoryState } from './memory';

describe('context', () => {
  const mockPhilosopher: Philosopher = {
    id: 'confucius',
    name: 'Confucius',
    school: 'Confucianism',
    port: 3101,
    personaSummary: 'The Master',
    personaTemplate: 'You are Confucius, the great sage.',
  };

  const createMockMessage = (overrides: Partial<MessageEvent> = {}): MessageEvent => ({
    id: 'msg-1',
    type: 'message',
    speaker: 'laozi',
    recipients: ['confucius'],
    phase: 'introduce',
    timestamp: '2024-01-15T14:30:00Z',
    surface: 'Hello, friend',
    translations: { english: 'Hello, friend' },
    ...overrides,
  });

  describe('assembleContextForPhilosopher', () => {
    describe('basic context assembly', () => {
      it('should assemble basic context with empty history', () => {
        const memoryState = createEmptyMemories([mockPhilosopher]);
        const newPrompt = {
          recipients: ['laozi'],
          text: 'What is the way?',
          timestamp: '2024-01-15T15:00:00Z',
          speaker: 'moderator',
        };

        const result = assembleContextForPhilosopher(mockPhilosopher, memoryState, newPrompt);

        expect(result.promptText).toContain('You are Confucius, the great sage.');
        expect(result.promptText).toContain('What is the way?');
        expect(result.promptText).toContain('Addressed: laozi');
        expect(result.renderedHistory).toBe('');
        expect(result.latestLine).toBe('None');
        expect(result.historyEntries).toEqual([]);
      });

      it('should include philosopher persona template', () => {
        const memoryState = createEmptyMemories([mockPhilosopher]);
        const newPrompt = {
          recipients: [],
          text: 'Speak',
          timestamp: '2024-01-15T15:00:00Z',
          speaker: 'moderator',
        };

        const result = assembleContextForPhilosopher(mockPhilosopher, memoryState, newPrompt);

        expect(result.promptText).toContain('<SystemPersona philosopher="confucius"');
        expect(result.promptText).toContain('You are Confucius, the great sage.');
      });

      it('should include prompt directive', () => {
        const memoryState = createEmptyMemories([mockPhilosopher]);
        const newPrompt = {
          recipients: ['laozi'],
          text: 'Discuss virtue',
          timestamp: '2024-01-15T15:00:00Z',
          speaker: 'moderator',
        };

        const result = assembleContextForPhilosopher(mockPhilosopher, memoryState, newPrompt);

        expect(result.promptText).toContain('<Directive>');
        expect(result.promptText).toContain('Prompt: Discuss virtue');
        expect(result.promptText).toContain('Addressed: laozi');
      });

      it('should include output contract', () => {
        const memoryState = createEmptyMemories([mockPhilosopher]);
        const newPrompt = {
          recipients: [],
          text: 'Speak',
          timestamp: '2024-01-15T15:00:00Z',
          speaker: 'moderator',
        };

        const result = assembleContextForPhilosopher(mockPhilosopher, memoryState, newPrompt);

        expect(result.promptText).toContain('<OutputContract>');
        expect(result.promptText).toContain('reasoning');
        expect(result.promptText).toContain('final');
        expect(result.promptText).toContain('addressees');
      });
    });

    describe('topic handling', () => {
      it('should include topic when provided', () => {
        const memoryState = createEmptyMemories([mockPhilosopher]);
        const newPrompt = {
          recipients: [],
          text: 'Speak',
          timestamp: '2024-01-15T15:00:00Z',
          speaker: 'moderator',
        };
        const topic = 'The Nature of Virtue';

        const result = assembleContextForPhilosopher(mockPhilosopher, memoryState, newPrompt, topic);

        expect(result.promptText).toContain('<Topic>');
        expect(result.promptText).toContain('The Nature of Virtue');
      });

      it('should omit topic section when not provided', () => {
        const memoryState = createEmptyMemories([mockPhilosopher]);
        const newPrompt = {
          recipients: [],
          text: 'Speak',
          timestamp: '2024-01-15T15:00:00Z',
          speaker: 'moderator',
        };

        const result = assembleContextForPhilosopher(mockPhilosopher, memoryState, newPrompt);

        expect(result.promptText).not.toContain('<Topic>');
      });

      it('should handle empty string topic', () => {
        const memoryState = createEmptyMemories([mockPhilosopher]);
        const newPrompt = {
          recipients: [],
          text: 'Speak',
          timestamp: '2024-01-15T15:00:00Z',
          speaker: 'moderator',
        };

        const result = assembleContextForPhilosopher(mockPhilosopher, memoryState, newPrompt, '');

        expect(result.promptText).not.toContain('<Topic>');
      });
    });

    describe('recipients formatting', () => {
      it('should format single recipient', () => {
        const memoryState = createEmptyMemories([mockPhilosopher]);
        const newPrompt = {
          recipients: ['laozi'],
          text: 'Speak',
          timestamp: '2024-01-15T15:00:00Z',
          speaker: 'moderator',
        };

        const result = assembleContextForPhilosopher(mockPhilosopher, memoryState, newPrompt);

        expect(result.promptText).toContain('Addressed: laozi');
      });

      it('should format multiple recipients as CSV', () => {
        const memoryState = createEmptyMemories([mockPhilosopher]);
        const newPrompt = {
          recipients: ['laozi', 'mencius', 'mozi'],
          text: 'Speak',
          timestamp: '2024-01-15T15:00:00Z',
          speaker: 'moderator',
        };

        const result = assembleContextForPhilosopher(mockPhilosopher, memoryState, newPrompt);

        expect(result.promptText).toContain('Addressed: laozi, mencius, mozi');
      });

      it('should use "all" when no recipients', () => {
        const memoryState = createEmptyMemories([mockPhilosopher]);
        const newPrompt = {
          recipients: [],
          text: 'Speak',
          timestamp: '2024-01-15T15:00:00Z',
          speaker: 'moderator',
        };

        const result = assembleContextForPhilosopher(mockPhilosopher, memoryState, newPrompt);

        expect(result.promptText).toContain('Addressed: all');
      });
    });

    describe('message history separation', () => {
      it('should separate direct messages from ambient', () => {
        const laozi: Philosopher = { ...mockPhilosopher, id: 'laozi' };
        const mencius: Philosopher = { ...mockPhilosopher, id: 'mencius' };
        let memoryState = createEmptyMemories([mockPhilosopher, laozi, mencius]);

        // Direct to confucius
        const directMsg = createMockMessage({
          speaker: 'laozi',
          recipients: ['confucius'],
          surface: 'Direct message',
        });
        memoryState = pushMemoryEntry(memoryState, directMsg);

        // Ambient (confucius is NOT a recipient, but we add to 'all' so it's visible)
        const ambientMsg = createMockMessage({
          speaker: 'laozi',
          recipients: ['mencius'],
          surface: 'Ambient message',
        });
        memoryState = pushMemoryEntry(memoryState, ambientMsg);

        const newPrompt = {
          recipients: [],
          text: 'Speak',
          timestamp: '2024-01-15T15:00:00Z',
          speaker: 'moderator',
        };

        const result = assembleContextForPhilosopher(mockPhilosopher, memoryState, newPrompt);

        // Direct message should be in DirectMessages (confucius is recipient)
        expect(result.promptText).toContain('<DirectMessages');
        expect(result.promptText).toContain('Direct message');

        // Ambient message is NOT in confucius's memory (only in mencius and 'all')
        // so it won't appear in the context
        expect(result.promptText).toContain('<AmbientContext');
        expect(result.historyEntries).toHaveLength(1); // Only direct message
      });

      it('should treat messages TO philosopher as direct', () => {
        const laozi: Philosopher = { ...mockPhilosopher, id: 'laozi' };
        let memoryState = createEmptyMemories([mockPhilosopher, laozi]);

        const msg = createMockMessage({
          speaker: 'laozi',
          recipients: ['confucius'],
          surface: 'To confucius',
        });
        memoryState = pushMemoryEntry(memoryState, msg);

        const newPrompt = {
          recipients: [],
          text: 'Speak',
          timestamp: '2024-01-15T15:00:00Z',
          speaker: 'moderator',
        };

        const result = assembleContextForPhilosopher(mockPhilosopher, memoryState, newPrompt);

        expect(result.promptText).toContain('<DirectMessages');
        expect(result.promptText).toContain('To confucius');
        // AmbientContext tag is always present, but should show "None"
        expect(result.promptText).toMatch(/<AmbientContext[^>]*>[\s\S]*?None[\s\S]*?<\/AmbientContext>/);
      });

      it('should handle when philosopher is both speaker and recipient', () => {
        const laozi: Philosopher = { ...mockPhilosopher, id: 'laozi' };
        let memoryState = createEmptyMemories([mockPhilosopher, laozi]);

        // Message where confucius is both speaker AND recipient (self-message or group message)
        const msg = createMockMessage({
          speaker: 'confucius',
          recipients: ['laozi', 'confucius'],
          surface: 'To group including self',
        });
        memoryState = pushMemoryEntry(memoryState, msg);

        const newPrompt = {
          recipients: [],
          text: 'Speak',
          timestamp: '2024-01-15T15:00:00Z',
          speaker: 'moderator',
        };

        const result = assembleContextForPhilosopher(mockPhilosopher, memoryState, newPrompt);

        // Should be in direct messages since confucius is speaker
        expect(result.promptText).toContain('<DirectMessages');
        expect(result.promptText).toContain('To group including self');
      });

      it('should not show messages to "all" unless philosopher is recipient', () => {
        const laozi: Philosopher = { ...mockPhilosopher, id: 'laozi' };
        let memoryState = createEmptyMemories([mockPhilosopher, laozi]);

        // Message to "all" recipient - goes to 'all' memory only, not individual philosophers
        const msg = createMockMessage({
          speaker: 'laozi',
          recipients: ['all'],
          surface: 'Broadcast message',
        });
        memoryState = pushMemoryEntry(memoryState, msg);

        const newPrompt = {
          recipients: [],
          text: 'Speak',
          timestamp: '2024-01-15T15:00:00Z',
          speaker: 'moderator',
        };

        const result = assembleContextForPhilosopher(mockPhilosopher, memoryState, newPrompt);

        // Message is NOT in confucius's personal memory (only in 'all' memory)
        expect(result.historyEntries).toHaveLength(0);
      });

      it('should show "None" when no direct messages', () => {
        const memoryState = createEmptyMemories([mockPhilosopher]);
        const newPrompt = {
          recipients: [],
          text: 'Speak',
          timestamp: '2024-01-15T15:00:00Z',
          speaker: 'moderator',
        };

        const result = assembleContextForPhilosopher(mockPhilosopher, memoryState, newPrompt);

        expect(result.promptText).toContain('<DirectMessages');
        expect(result.promptText).toContain('None');
      });

      it('should show "None" when no ambient messages', () => {
        const memoryState = createEmptyMemories([mockPhilosopher]);
        const newPrompt = {
          recipients: [],
          text: 'Speak',
          timestamp: '2024-01-15T15:00:00Z',
          speaker: 'moderator',
        };

        const result = assembleContextForPhilosopher(mockPhilosopher, memoryState, newPrompt);

        expect(result.promptText).toContain('<AmbientContext');
        expect(result.promptText).toContain('None');
      });
    });

    describe('message formatting', () => {
      it('should format messages as JSON with sender/receivers/message', () => {
        const laozi: Philosopher = { ...mockPhilosopher, id: 'laozi' };
        let memoryState = createEmptyMemories([mockPhilosopher, laozi]);

        const msg = createMockMessage({
          speaker: 'laozi',
          recipients: ['confucius'],
          surface: 'Test message',
        });
        memoryState = pushMemoryEntry(memoryState, msg);

        const newPrompt = {
          recipients: [],
          text: 'Speak',
          timestamp: '2024-01-15T15:00:00Z',
          speaker: 'moderator',
        };

        const result = assembleContextForPhilosopher(mockPhilosopher, memoryState, newPrompt);

        expect(result.promptText).toContain('"sender": "laozi"');
        expect(result.promptText).toContain('"receivers": ["confucius"]');
        expect(result.promptText).toContain('"message": "Test message"');
      });

      it('should escape quotes in messages', () => {
        const laozi: Philosopher = { ...mockPhilosopher, id: 'laozi' };
        let memoryState = createEmptyMemories([mockPhilosopher, laozi]);

        const msg = createMockMessage({
          speaker: 'laozi',
          recipients: ['confucius'],
          surface: 'He said "virtue" is important',
        });
        memoryState = pushMemoryEntry(memoryState, msg);

        const newPrompt = {
          recipients: [],
          text: 'Speak',
          timestamp: '2024-01-15T15:00:00Z',
          speaker: 'moderator',
        };

        const result = assembleContextForPhilosopher(mockPhilosopher, memoryState, newPrompt);

        expect(result.promptText).toContain('\\"virtue\\"');
        expect(result.renderedHistory).toContain('\\"virtue\\"');
      });

      it('should format multiple recipients correctly', () => {
        const laozi: Philosopher = { ...mockPhilosopher, id: 'laozi' };
        const mencius: Philosopher = { ...mockPhilosopher, id: 'mencius' };
        let memoryState = createEmptyMemories([mockPhilosopher, laozi, mencius]);

        const msg = createMockMessage({
          speaker: 'laozi',
          recipients: ['confucius', 'mencius'],
          surface: 'To multiple',
        });
        memoryState = pushMemoryEntry(memoryState, msg);

        const newPrompt = {
          recipients: [],
          text: 'Speak',
          timestamp: '2024-01-15T15:00:00Z',
          speaker: 'moderator',
        };

        const result = assembleContextForPhilosopher(mockPhilosopher, memoryState, newPrompt);

        expect(result.promptText).toContain('"receivers": ["confucius", "mencius"]');
      });
    });

    describe('latest message handling', () => {
      it('should include latest message for philosopher', () => {
        const laozi: Philosopher = { ...mockPhilosopher, id: 'laozi' };
        let memoryState = createEmptyMemories([mockPhilosopher, laozi]);

        const msg1 = createMockMessage({
          id: 'msg-1',
          speaker: 'laozi',
          recipients: ['confucius'],
          surface: 'First message',
        });
        const msg2 = createMockMessage({
          id: 'msg-2',
          speaker: 'laozi',
          recipients: ['confucius'],
          surface: 'Latest message',
        });

        memoryState = pushMemoryEntry(memoryState, msg1);
        memoryState = pushMemoryEntry(memoryState, msg2);

        const newPrompt = {
          recipients: [],
          text: 'Speak',
          timestamp: '2024-01-15T15:00:00Z',
          speaker: 'moderator',
        };

        const result = assembleContextForPhilosopher(mockPhilosopher, memoryState, newPrompt);

        expect(result.promptText).toContain('<LatestExchange>');
        expect(result.latestLine).toContain('Latest message');
      });

      it('should show "None" when no latest message', () => {
        const memoryState = createEmptyMemories([mockPhilosopher]);
        const newPrompt = {
          recipients: [],
          text: 'Speak',
          timestamp: '2024-01-15T15:00:00Z',
          speaker: 'moderator',
        };

        const result = assembleContextForPhilosopher(mockPhilosopher, memoryState, newPrompt);

        expect(result.latestLine).toBe('None');
        expect(result.promptText).toContain('<LatestExchange>');
        expect(result.promptText).toContain('None');
      });
    });

    describe('max limit enforcement', () => {
      it('should trim history to max limit', () => {
        const laozi: Philosopher = { ...mockPhilosopher, id: 'laozi' };
        let memoryState = createEmptyMemories([mockPhilosopher, laozi], 3);

        // Add 5 messages, only last 3 should be kept
        for (let i = 1; i <= 5; i++) {
          const msg = createMockMessage({
            id: `msg-${i}`,
            speaker: 'laozi',
            recipients: ['confucius'],
            surface: `Message ${i}`,
          });
          memoryState = pushMemoryEntry(memoryState, msg);
        }

        const newPrompt = {
          recipients: [],
          text: 'Speak',
          timestamp: '2024-01-15T15:00:00Z',
          speaker: 'moderator',
        };

        const result = assembleContextForPhilosopher(mockPhilosopher, memoryState, newPrompt);

        expect(result.historyEntries).toHaveLength(3);
        expect(result.historyEntries[0]?.message).toBe('Message 3');
        expect(result.historyEntries[2]?.message).toBe('Message 5');
      });

      it('should include max in prompt text', () => {
        const memoryState = createEmptyMemories([mockPhilosopher], 100);
        const newPrompt = {
          recipients: [],
          text: 'Speak',
          timestamp: '2024-01-15T15:00:00Z',
          speaker: 'moderator',
        };

        const result = assembleContextForPhilosopher(mockPhilosopher, memoryState, newPrompt);

        expect(result.promptText).toContain('max="100"');
      });
    });

    describe('rendered history', () => {
      it('should include all trimmed history in renderedHistory field', () => {
        const laozi: Philosopher = { ...mockPhilosopher, id: 'laozi' };
        let memoryState = createEmptyMemories([mockPhilosopher, laozi]);

        // Message to confucius
        const msg1 = createMockMessage({
          speaker: 'laozi',
          recipients: ['confucius'],
          surface: 'First',
        });
        // Message to confucius again
        const msg2 = createMockMessage({
          speaker: 'laozi',
          recipients: ['confucius'],
          surface: 'Second',
        });

        memoryState = pushMemoryEntry(memoryState, msg1);
        memoryState = pushMemoryEntry(memoryState, msg2);

        const newPrompt = {
          recipients: [],
          text: 'Speak',
          timestamp: '2024-01-15T15:00:00Z',
          speaker: 'moderator',
        };

        const result = assembleContextForPhilosopher(mockPhilosopher, memoryState, newPrompt);

        expect(result.renderedHistory).toContain('First');
        expect(result.renderedHistory).toContain('Second');
        expect(result.renderedHistory.split('\n')).toHaveLength(2);
      });

      it('should return empty string for renderedHistory when no history', () => {
        const memoryState = createEmptyMemories([mockPhilosopher]);
        const newPrompt = {
          recipients: [],
          text: 'Speak',
          timestamp: '2024-01-15T15:00:00Z',
          speaker: 'moderator',
        };

        const result = assembleContextForPhilosopher(mockPhilosopher, memoryState, newPrompt);

        expect(result.renderedHistory).toBe('');
      });
    });

    describe('XML structure', () => {
      it('should use CDATA sections for content', () => {
        const memoryState = createEmptyMemories([mockPhilosopher]);
        const newPrompt = {
          recipients: [],
          text: 'Speak',
          timestamp: '2024-01-15T15:00:00Z',
          speaker: 'moderator',
        };

        const result = assembleContextForPhilosopher(mockPhilosopher, memoryState, newPrompt);

        // Count CDATA sections
        const cdataCount = (result.promptText.match(/<!\[CDATA\[/g) || []).length;
        expect(cdataCount).toBeGreaterThan(5); // SystemPersona, DirectMessages, AmbientContext, LatestExchange, Directive, OutputContract
      });

      it('should close all CDATA sections', () => {
        const memoryState = createEmptyMemories([mockPhilosopher]);
        const newPrompt = {
          recipients: [],
          text: 'Speak',
          timestamp: '2024-01-15T15:00:00Z',
          speaker: 'moderator',
        };

        const result = assembleContextForPhilosopher(mockPhilosopher, memoryState, newPrompt);

        const openCount = (result.promptText.match(/<!\[CDATA\[/g) || []).length;
        const closeCount = (result.promptText.match(/\]\]>/g) || []).length;
        expect(openCount).toBe(closeCount);
      });

      it('should have properly nested XML tags', () => {
        const memoryState = createEmptyMemories([mockPhilosopher]);
        const newPrompt = {
          recipients: [],
          text: 'Speak',
          timestamp: '2024-01-15T15:00:00Z',
          speaker: 'moderator',
        };

        const result = assembleContextForPhilosopher(mockPhilosopher, memoryState, newPrompt);

        expect(result.promptText).toMatch(/<Prompt>/);
        expect(result.promptText).toMatch(/<\/Prompt>/);
        expect(result.promptText.indexOf('<Prompt>')).toBeLessThan(result.promptText.indexOf('</Prompt>'));
      });
    });

    describe('edge cases', () => {
      it('should handle empty philosopher persona template', () => {
        const philosopher: Philosopher = {
          ...mockPhilosopher,
          personaTemplate: '',
        };
        const memoryState = createEmptyMemories([philosopher]);
        const newPrompt = {
          recipients: [],
          text: 'Speak',
          timestamp: '2024-01-15T15:00:00Z',
          speaker: 'moderator',
        };

        const result = assembleContextForPhilosopher(philosopher, memoryState, newPrompt);

        expect(result.promptText).toContain('<SystemPersona');
        expect(result.promptText).toBeTruthy();
      });

      it('should handle very long prompt text', () => {
        const memoryState = createEmptyMemories([mockPhilosopher]);
        const longText = 'a'.repeat(10000);
        const newPrompt = {
          recipients: [],
          text: longText,
          timestamp: '2024-01-15T15:00:00Z',
          speaker: 'moderator',
        };

        const result = assembleContextForPhilosopher(mockPhilosopher, memoryState, newPrompt);

        expect(result.promptText).toContain(longText);
      });

      it('should handle special characters in topic', () => {
        const memoryState = createEmptyMemories([mockPhilosopher]);
        const newPrompt = {
          recipients: [],
          text: 'Speak',
          timestamp: '2024-01-15T15:00:00Z',
          speaker: 'moderator',
        };
        const topic = 'The Way & Virtue: <Philosophy> in "Practice"';

        const result = assembleContextForPhilosopher(mockPhilosopher, memoryState, newPrompt, topic);

        expect(result.promptText).toContain(topic);
      });

      it('should handle special characters in prompt text', () => {
        const memoryState = createEmptyMemories([mockPhilosopher]);
        const newPrompt = {
          recipients: [],
          text: 'What is <virtue> & "the way"?',
          timestamp: '2024-01-15T15:00:00Z',
          speaker: 'moderator',
        };

        const result = assembleContextForPhilosopher(mockPhilosopher, memoryState, newPrompt);

        expect(result.promptText).toContain('What is <virtue> & "the way"?');
      });

      it('should handle philosopher with special characters in ID', () => {
        const philosopher: Philosopher = {
          ...mockPhilosopher,
          id: 'philosopher-123_test',
        };
        const memoryState = createEmptyMemories([philosopher]);
        const newPrompt = {
          recipients: [],
          text: 'Speak',
          timestamp: '2024-01-15T15:00:00Z',
          speaker: 'moderator',
        };

        const result = assembleContextForPhilosopher(philosopher, memoryState, newPrompt);

        expect(result.promptText).toContain('philosopher="philosopher-123_test"');
      });
    });
  });
});
