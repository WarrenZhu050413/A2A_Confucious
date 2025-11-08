import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useQueueOrchestrator } from './useQueueOrchestrator';
import type { Philosopher, MessageEvent, Phase, MemoryState } from '../types';
import { createEmptyMemories } from '../lib/memory';

// Mock the API module
vi.mock('../lib/api', () => ({
  sendMessageToBackend: vi.fn(),
}));

import { sendMessageToBackend } from '../lib/api';

describe('useQueueOrchestrator', () => {
  const mockPhilosophers: Philosopher[] = [
    {
      id: 'confucius',
      name: 'Confucius',
      personaTemplate: 'I am Confucius',
      emoji: '🎓',
      color: '#FF0000',
    },
    {
      id: 'laozi',
      name: 'Laozi',
      personaTemplate: 'I am Laozi',
      emoji: '🌊',
      color: '#0000FF',
    },
    {
      id: 'mozi',
      name: 'Mozi',
      personaTemplate: 'I am Mozi',
      emoji: '⚖️',
      color: '#00FF00',
    },
  ];

  const mockPhilosopherMap = new Map(
    mockPhilosophers.map((p) => [p.id, p])
  );
  const mockPhilosopherIds = mockPhilosophers.map((p) => p.id);
  const mockCurrentPhase: Phase = 'introduce';
  const mockTopic = 'The Way';
  let mockMemories: MemoryState;

  const createMockMessage = (overrides: Partial<MessageEvent> = {}): MessageEvent => ({
    id: `msg-${Date.now()}-${Math.random()}`,
    type: 'message',
    speaker: 'moderator',
    recipients: ['all'],
    phase: 'introduce',
    timestamp: new Date().toISOString(),
    surface: 'Hello',
    ...overrides,
  });

  const createMockCallbacks = () => ({
    onMessageCreated: vi.fn(),
    onSnapshotCreated: vi.fn(),
    onMemoryUpdate: vi.fn(),
    onEventLog: vi.fn(),
    onBackendError: vi.fn(),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockMemories = createEmptyMemories(mockPhilosophers);
    vi.mocked(sendMessageToBackend).mockResolvedValue({
      content: JSON.stringify({
        final: 'Mock response',
        reasoning: 'Mock reasoning',
      }),
    });
  });

  describe('initialization', () => {
    it('should initialize with empty queues', () => {
      const callbacks = createMockCallbacks();
      const { result } = renderHook(() =>
        useQueueOrchestrator({
          philosophers: mockPhilosophers,
          philosopherMap: mockPhilosopherMap,
          philosopherIds: mockPhilosopherIds,
          currentPhase: mockCurrentPhase,
          topic: mockTopic,
          memories: mockMemories,
          isPaused: false,
          ...callbacks,
        })
      );

      expect(result.current.queueDepths).toEqual({
        confucius: 0,
        laozi: 0,
        mozi: 0,
      });
      expect(result.current.queueOrder).toEqual([]);
      expect(result.current.currentSpeaker).toBeNull();
    });

    it('should handle new philosophers being added', () => {
      const callbacks = createMockCallbacks();
      const { result, rerender } = renderHook(
        ({ philosophers, philosopherIds }) =>
          useQueueOrchestrator({
            philosophers,
            philosopherMap: new Map(philosophers.map((p) => [p.id, p])),
            philosopherIds,
            currentPhase: mockCurrentPhase,
            topic: mockTopic,
            memories: mockMemories,
            isPaused: false,
            ...callbacks,
          }),
        {
          initialProps: {
            philosophers: mockPhilosophers.slice(0, 2),
            philosopherIds: mockPhilosopherIds.slice(0, 2),
          },
        }
      );

      expect(result.current.queueDepths).toEqual({
        confucius: 0,
        laozi: 0,
      });

      // Add new philosopher
      rerender({
        philosophers: mockPhilosophers,
        philosopherIds: mockPhilosopherIds,
      });

      expect(result.current.queueDepths).toEqual({
        confucius: 0,
        laozi: 0,
        mozi: 0,
      });
    });
  });

  describe('enqueueWithPriority', () => {
    it('should enqueue philosophers in specified order', () => {
      const callbacks = createMockCallbacks();
      const { result } = renderHook(() =>
        useQueueOrchestrator({
          philosophers: mockPhilosophers,
          philosopherMap: mockPhilosopherMap,
          philosopherIds: mockPhilosopherIds,
          currentPhase: mockCurrentPhase,
          topic: mockTopic,
          memories: mockMemories,
          isPaused: true, // Paused to prevent auto-processing
          ...callbacks,
        })
      );

      const triggerMessage = createMockMessage();

      act(() => {
        result.current.enqueueWithPriority(['laozi', 'mozi'], triggerMessage);
      });

      expect(result.current.queueOrder).toEqual(['laozi', 'mozi']);
      expect(result.current.queueDepths).toEqual({
        confucius: 0,
        laozi: 1,
        mozi: 1,
      });
    });

    it('should deduplicate philosophers already in queue', () => {
      const callbacks = createMockCallbacks();
      const { result } = renderHook(() =>
        useQueueOrchestrator({
          philosophers: mockPhilosophers,
          philosopherMap: mockPhilosopherMap,
          philosopherIds: mockPhilosopherIds,
          currentPhase: mockCurrentPhase,
          topic: mockTopic,
          memories: mockMemories,
          isPaused: true,
          ...callbacks,
        })
      );

      const trigger1 = createMockMessage({ id: 'msg-1' });
      const trigger2 = createMockMessage({ id: 'msg-2' });

      act(() => {
        result.current.enqueueWithPriority(['laozi', 'mozi'], trigger1);
        result.current.enqueueWithPriority(['mozi', 'confucius'], trigger2);
      });

      // Order preserves first occurrence
      expect(result.current.queueOrder).toEqual(['laozi', 'mozi', 'confucius']);
      // But mozi has 2 pending tasks
      expect(result.current.queueDepths).toEqual({
        confucius: 1,
        laozi: 1,
        mozi: 2, // Two tasks batched
      });
    });

    it('should ignore invalid philosopher IDs', () => {
      const callbacks = createMockCallbacks();
      const { result } = renderHook(() =>
        useQueueOrchestrator({
          philosophers: mockPhilosophers,
          philosopherMap: mockPhilosopherMap,
          philosopherIds: mockPhilosopherIds,
          currentPhase: mockCurrentPhase,
          topic: mockTopic,
          memories: mockMemories,
          isPaused: true,
          ...callbacks,
        })
      );

      const triggerMessage = createMockMessage();

      act(() => {
        result.current.enqueueWithPriority(
          ['laozi', 'invalid-id', 'mozi'],
          triggerMessage
        );
      });

      expect(result.current.queueOrder).toEqual(['laozi', 'mozi']);
    });

    it('should handle empty addressees array', () => {
      const callbacks = createMockCallbacks();
      const { result } = renderHook(() =>
        useQueueOrchestrator({
          philosophers: mockPhilosophers,
          philosopherMap: mockPhilosopherMap,
          philosopherIds: mockPhilosopherIds,
          currentPhase: mockCurrentPhase,
          topic: mockTopic,
          memories: mockMemories,
          isPaused: true,
          ...callbacks,
        })
      );

      const triggerMessage = createMockMessage();

      act(() => {
        result.current.enqueueWithPriority([], triggerMessage);
      });

      expect(result.current.queueOrder).toEqual([]);
      expect(result.current.queueDepths).toEqual({
        confucius: 0,
        laozi: 0,
        mozi: 0,
      });
    });
  });

  describe('enqueueResponsesFromMessage', () => {
    it('should enqueue all philosophers when recipients is "all"', () => {
      const callbacks = createMockCallbacks();
      const { result } = renderHook(() =>
        useQueueOrchestrator({
          philosophers: mockPhilosophers,
          philosopherMap: mockPhilosopherMap,
          philosopherIds: mockPhilosopherIds,
          currentPhase: mockCurrentPhase,
          topic: mockTopic,
          memories: mockMemories,
          isPaused: true,
          ...callbacks,
        })
      );

      const message = createMockMessage({
        speaker: 'confucius',
        recipients: ['all'],
      });

      act(() => {
        result.current.enqueueResponsesFromMessage(message);
      });

      // All except speaker (confucius)
      expect(result.current.queueOrder).toEqual(['laozi', 'mozi']);
    });

    it('should enqueue specific recipients', () => {
      const callbacks = createMockCallbacks();
      const { result } = renderHook(() =>
        useQueueOrchestrator({
          philosophers: mockPhilosophers,
          philosopherMap: mockPhilosopherMap,
          philosopherIds: mockPhilosopherIds,
          currentPhase: mockCurrentPhase,
          topic: mockTopic,
          memories: mockMemories,
          isPaused: true,
          ...callbacks,
        })
      );

      const message = createMockMessage({
        speaker: 'confucius',
        recipients: ['laozi', 'mozi'],
      });

      act(() => {
        result.current.enqueueResponsesFromMessage(message);
      });

      expect(result.current.queueOrder).toEqual(['laozi', 'mozi']);
    });

    it('should not enqueue the speaker themselves', () => {
      const callbacks = createMockCallbacks();
      const { result } = renderHook(() =>
        useQueueOrchestrator({
          philosophers: mockPhilosophers,
          philosopherMap: mockPhilosopherMap,
          philosopherIds: mockPhilosopherIds,
          currentPhase: mockCurrentPhase,
          topic: mockTopic,
          memories: mockMemories,
          isPaused: true,
          ...callbacks,
        })
      );

      const message = createMockMessage({
        speaker: 'confucius',
        recipients: ['confucius', 'laozi'],
      });

      act(() => {
        result.current.enqueueResponsesFromMessage(message);
      });

      expect(result.current.queueOrder).toEqual(['laozi']);
    });

    it('should deduplicate messages by ID', () => {
      const callbacks = createMockCallbacks();
      const { result } = renderHook(() =>
        useQueueOrchestrator({
          philosophers: mockPhilosophers,
          philosopherMap: mockPhilosopherMap,
          philosopherIds: mockPhilosopherIds,
          currentPhase: mockCurrentPhase,
          topic: mockTopic,
          memories: mockMemories,
          isPaused: true,
          ...callbacks,
        })
      );

      const message = createMockMessage({
        id: 'msg-same',
        speaker: 'confucius',
        recipients: ['laozi'],
      });

      act(() => {
        result.current.enqueueResponsesFromMessage(message);
        result.current.enqueueResponsesFromMessage(message); // Same ID
      });

      // Should only enqueue once
      expect(result.current.queueDepths.laozi).toBe(1);
    });

    it('should skip if no valid recipients', () => {
      const callbacks = createMockCallbacks();
      const { result } = renderHook(() =>
        useQueueOrchestrator({
          philosophers: mockPhilosophers,
          philosopherMap: mockPhilosopherMap,
          philosopherIds: mockPhilosopherIds,
          currentPhase: mockCurrentPhase,
          topic: mockTopic,
          memories: mockMemories,
          isPaused: true,
          ...callbacks,
        })
      );

      const message = createMockMessage({
        speaker: 'confucius',
        recipients: ['invalid-id'],
      });

      act(() => {
        result.current.enqueueResponsesFromMessage(message);
      });

      expect(result.current.queueOrder).toEqual([]);
    });
  });

  describe('queue processing', () => {
    it('should process queue sequentially when not paused', async () => {
      const callbacks = createMockCallbacks();
      const { result } = renderHook(() =>
        useQueueOrchestrator({
          philosophers: mockPhilosophers,
          philosopherMap: mockPhilosopherMap,
          philosopherIds: mockPhilosopherIds,
          currentPhase: mockCurrentPhase,
          topic: mockTopic,
          memories: mockMemories,
          isPaused: false, // Not paused
          ...callbacks,
        })
      );

      const message = createMockMessage({
        speaker: 'moderator',
        recipients: ['confucius'],
      });

      act(() => {
        result.current.enqueueResponsesFromMessage(message);
      });

      // Wait for async processing
      await waitFor(() => {
        expect(callbacks.onMessageCreated).toHaveBeenCalled();
      });

      // Should have created a message
      const createdMessage = callbacks.onMessageCreated.mock.calls[0]?.[0];
      expect(createdMessage).toBeDefined();
      expect(createdMessage.speaker).toBe('confucius');
    });

    it('should not process queue when paused', async () => {
      const callbacks = createMockCallbacks();
      const { result } = renderHook(() =>
        useQueueOrchestrator({
          philosophers: mockPhilosophers,
          philosopherMap: mockPhilosopherMap,
          philosopherIds: mockPhilosopherIds,
          currentPhase: mockCurrentPhase,
          topic: mockTopic,
          memories: mockMemories,
          isPaused: true, // Paused
          ...callbacks,
        })
      );

      const message = createMockMessage({
        speaker: 'moderator',
        recipients: ['confucius'],
      });

      act(() => {
        result.current.enqueueResponsesFromMessage(message);
      });

      // Wait a bit to ensure no processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(callbacks.onMessageCreated).not.toHaveBeenCalled();
      expect(result.current.queueDepths.confucius).toBe(1);
    });

    it('should resume processing when unpaused', async () => {
      const callbacks = createMockCallbacks();
      const { result, rerender } = renderHook(
        ({ isPaused }) =>
          useQueueOrchestrator({
            philosophers: mockPhilosophers,
            philosopherMap: mockPhilosopherMap,
            philosopherIds: mockPhilosopherIds,
            currentPhase: mockCurrentPhase,
            topic: mockTopic,
            memories: mockMemories,
            isPaused,
            ...callbacks,
          }),
        {
          initialProps: { isPaused: true },
        }
      );

      const message = createMockMessage({
        speaker: 'moderator',
        recipients: ['confucius'],
      });

      act(() => {
        result.current.enqueueResponsesFromMessage(message);
      });

      expect(callbacks.onMessageCreated).not.toHaveBeenCalled();

      // Unpause
      rerender({ isPaused: false });

      await waitFor(() => {
        expect(callbacks.onMessageCreated).toHaveBeenCalled();
      });
    });

    it('should set currentSpeaker while processing', async () => {
      const callbacks = createMockCallbacks();
      const { result } = renderHook(() =>
        useQueueOrchestrator({
          philosophers: mockPhilosophers,
          philosopherMap: mockPhilosopherMap,
          philosopherIds: mockPhilosopherIds,
          currentPhase: mockCurrentPhase,
          topic: mockTopic,
          memories: mockMemories,
          isPaused: false,
          ...callbacks,
        })
      );

      // Mock slow backend response
      vi.mocked(sendMessageToBackend).mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                content: JSON.stringify({ final: 'Response', reasoning: 'Reason' }),
              });
            }, 50);
          })
      );

      const message = createMockMessage({
        speaker: 'moderator',
        recipients: ['confucius'],
      });

      act(() => {
        result.current.enqueueResponsesFromMessage(message);
      });

      // Should set current speaker
      await waitFor(() => {
        expect(result.current.currentSpeaker).toBe('confucius');
      });

      // Should clear after processing
      await waitFor(() => {
        expect(result.current.currentSpeaker).toBeNull();
      });
    });

    it('should enforce global lock - only one speaker at a time', async () => {
      const callbacks = createMockCallbacks();
      const { result } = renderHook(() =>
        useQueueOrchestrator({
          philosophers: mockPhilosophers,
          philosopherMap: mockPhilosopherMap,
          philosopherIds: mockPhilosopherIds,
          currentPhase: mockCurrentPhase,
          topic: mockTopic,
          memories: mockMemories,
          isPaused: false,
          ...callbacks,
        })
      );

      // Mock slow responses - one for each philosopher
      let resolveFirst: ((value: unknown) => void) | undefined;
      let resolveSecond: ((value: unknown) => void) | undefined;
      let callCount = 0;

      vi.mocked(sendMessageToBackend).mockImplementation(
        () =>
          new Promise((resolve) => {
            callCount++;
            if (callCount === 1) {
              resolveFirst = resolve;
            } else {
              resolveSecond = resolve;
            }
          })
      );

      const message1 = createMockMessage({
        id: 'msg-1',
        speaker: 'moderator',
        recipients: ['confucius'],
      });
      const message2 = createMockMessage({
        id: 'msg-2',
        speaker: 'moderator',
        recipients: ['laozi'],
      });

      act(() => {
        result.current.enqueueResponsesFromMessage(message1);
        result.current.enqueueResponsesFromMessage(message2);
      });

      // Should process confucius first
      await waitFor(() => {
        expect(result.current.currentSpeaker).toBe('confucius');
      });

      // laozi should still be queued
      expect(result.current.queueDepths.laozi).toBe(1);

      // Complete first task
      act(() => {
        resolveFirst?.({
          content: JSON.stringify({ final: 'Response', reasoning: 'Reason' }),
        });
      });

      // Wait for first message to be created
      await waitFor(() => {
        expect(callbacks.onMessageCreated).toHaveBeenCalledTimes(1);
      });

      // Now laozi should start processing
      await waitFor(() => {
        expect(result.current.currentSpeaker).toBe('laozi');
      });

      // Complete second task
      act(() => {
        resolveSecond?.({
          content: JSON.stringify({ final: 'Response 2', reasoning: 'Reason 2' }),
        });
      });

      // Should now have processed both
      await waitFor(() => {
        expect(callbacks.onMessageCreated).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('batched task processing', () => {
    it('should batch multiple tasks for same philosopher', async () => {
      const callbacks = createMockCallbacks();
      const { result, rerender } = renderHook(
        ({ isPaused }) =>
          useQueueOrchestrator({
            philosophers: mockPhilosophers,
            philosopherMap: mockPhilosopherMap,
            philosopherIds: mockPhilosopherIds,
            currentPhase: mockCurrentPhase,
            topic: mockTopic,
            memories: mockMemories,
            isPaused,
            ...callbacks,
          }),
        {
          initialProps: { isPaused: true },
        }
      );

      const trigger1 = createMockMessage({ id: 'msg-1', surface: 'First' });
      const trigger2 = createMockMessage({ id: 'msg-2', surface: 'Second' });

      act(() => {
        result.current.enqueueWithPriority(['confucius'], trigger1);
        result.current.enqueueWithPriority(['confucius'], trigger2);
      });

      expect(result.current.queueDepths.confucius).toBe(2);

      // Unpause to trigger processing
      rerender({ isPaused: false });

      // Should process both in one batch
      await waitFor(() => {
        expect(callbacks.onMessageCreated).toHaveBeenCalledTimes(1);
        expect(result.current.queueDepths.confucius).toBe(0);
      });
    });
  });

  describe('error handling', () => {
    it('should call onBackendError on API failure', async () => {
      const callbacks = createMockCallbacks();
      const { result } = renderHook(() =>
        useQueueOrchestrator({
          philosophers: mockPhilosophers,
          philosopherMap: mockPhilosopherMap,
          philosopherIds: mockPhilosopherIds,
          currentPhase: mockCurrentPhase,
          topic: mockTopic,
          memories: mockMemories,
          isPaused: false,
          ...callbacks,
        })
      );

      vi.mocked(sendMessageToBackend).mockRejectedValueOnce(
        new Error('Backend error')
      );

      const message = createMockMessage({
        speaker: 'moderator',
        recipients: ['confucius'],
      });

      act(() => {
        result.current.enqueueResponsesFromMessage(message);
      });

      await waitFor(() => {
        expect(callbacks.onBackendError).toHaveBeenCalledWith('confucius');
      });

      // Should clear currentSpeaker even on error
      expect(result.current.currentSpeaker).toBeNull();
    });

    it('should continue processing queue after error', async () => {
      const callbacks = createMockCallbacks();
      const { result } = renderHook(() =>
        useQueueOrchestrator({
          philosophers: mockPhilosophers,
          philosopherMap: mockPhilosopherMap,
          philosopherIds: mockPhilosopherIds,
          currentPhase: mockCurrentPhase,
          topic: mockTopic,
          memories: mockMemories,
          isPaused: false,
          ...callbacks,
        })
      );

      // First fails, second succeeds
      vi.mocked(sendMessageToBackend)
        .mockRejectedValueOnce(new Error('Backend error'))
        .mockResolvedValueOnce({
          content: JSON.stringify({ final: 'Success', reasoning: 'Reason' }),
        });

      const message1 = createMockMessage({
        id: 'msg-1',
        recipients: ['confucius'],
      });
      const message2 = createMockMessage({
        id: 'msg-2',
        recipients: ['laozi'],
      });

      act(() => {
        result.current.enqueueResponsesFromMessage(message1);
        result.current.enqueueResponsesFromMessage(message2);
      });

      await waitFor(() => {
        expect(callbacks.onBackendError).toHaveBeenCalledWith('confucius');
        expect(callbacks.onMessageCreated).toHaveBeenCalledTimes(1);
      });

      const createdMessage = callbacks.onMessageCreated.mock.calls[0]?.[0];
      expect(createdMessage.speaker).toBe('laozi');
    });
  });
});
