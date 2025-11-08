import { useState, useRef, useCallback, useEffect } from 'react';
import type {
  Philosopher,
  MessageEvent,
  Phase,
  MemoryState,
  InspectorSnapshot,
  QuoteData,
} from '../types';
import { sendMessageToBackend } from '../lib/api';
import { assembleContextForPhilosopher } from '../lib/context';
import { parseModelResponse } from '../lib/parser';
import { buildHistoryLines } from '../lib/history';
import { formatTime } from '../lib/time';

type ResponseTask = {
  id: string;
  philosopherId: string;
  trigger: MessageEvent;
};

export interface UseQueueOrchestratorProps {
  philosophers: Philosopher[];
  philosopherMap: Map<string, Philosopher>;
  philosopherIds: string[];
  currentPhase: Phase;
  topic: string;
  memories: MemoryState;
  isPaused: boolean;
  onMessageCreated: (message: MessageEvent) => void;
  onSnapshotCreated: (snapshot: InspectorSnapshot) => void;
  onMemoryUpdate: (memoryState: MemoryState) => void;
  onEventLog: (entry: string, options?: { dedupe?: boolean }) => void;
  onBackendError: (philosopherId: string) => void;
}

export interface UseQueueOrchestratorReturn {
  queueDepths: Record<string, number>;
  queueOrder: string[];
  currentSpeaker: string | null;
  enqueueWithPriority: (addressees: string[], trigger: MessageEvent) => void;
  enqueueResponsesFromMessage: (message: MessageEvent) => void;
  drainQueues: () => void;
}

/**
 * Hook for managing the philosopher response queue with priority ordering.
 *
 * Implements:
 * - Global priority queue with addressee ordering
 * - Deduplication (philosophers stay in original position if already queued)
 * - Sequential dialogue enforcement (only one philosopher speaks at a time)
 * - Batched task processing (multiple messages to same philosopher combined)
 */
export function useQueueOrchestrator(
  props: UseQueueOrchestratorProps
): UseQueueOrchestratorReturn {
  const {
    philosophers,
    philosopherMap,
    philosopherIds,
    currentPhase,
    topic,
    memories,
    isPaused,
    onMessageCreated,
    onSnapshotCreated,
    onMemoryUpdate,
    onEventLog,
    onBackendError,
  } = props;

  const [queueDepths, setQueueDepths] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    philosopherIds.forEach((id) => {
      initial[id] = 0;
    });
    return initial;
  });
  const [queueOrder, setQueueOrder] = useState<string[]>([]);
  const [currentSpeaker, setCurrentSpeaker] = useState<string | null>(null);

  /**
   * GLOBAL PRIORITY QUEUE
   *
   * Replaces per-philosopher queues with a single global queue that preserves
   * addressee order. When a philosopher responds with addressees: ["laozi", "mozi"],
   * laozi will respond first, then mozi.
   *
   * Structure:
   * - queue: ordered list of philosopher IDs waiting to speak
   * - pending: Map of philosopher ID to their queued tasks (for batching)
   *
   * Deduplication: If a philosopher is already in queue, they stay in original position.
   * New tasks are added to their pending list for batched response.
   */
  const globalQueueRef = useRef<{
    queue: string[];
    pending: Map<string, ResponseTask[]>;
  }>({
    queue: [],
    pending: new Map(),
  });

  const processingRef = useRef<Record<string, boolean>>({});

  /**
   * SEQUENTIAL DIALOGUE ENFORCEMENT
   *
   * globallyProcessingRef ensures only ONE philosopher speaks at a time.
   * This creates natural turn-taking:
   * 1. Global lock prevents any agent from starting while another speaks
   * 2. When an agent's turn starts, they dequeue ALL messages for that agent
   * 3. Agent responds to all queued messages in a single comprehensive reply
   * 4. Lock releases, drainQueues() triggers next speaker
   */
  const globallyProcessingRef = useRef<boolean>(false);

  const processedMessagesRef = useRef(new Set<string>());
  const memoriesRef = useRef(memories);
  const isPausedRef = useRef(isPaused);
  const topicRef = useRef(topic);
  const messageCountRef = useRef(0);

  const updateQueueDepths = useCallback(() => {
    setQueueDepths((prev) => {
      const next: Record<string, number> = {};
      philosopherIds.forEach((id) => {
        next[id] = globalQueueRef.current.pending.get(id)?.length ?? 0;
      });
      const prevKeys = Object.keys(prev);
      if (prevKeys.length !== philosopherIds.length) {
        return next;
      }
      const changed = philosopherIds.some((id) => prev[id] !== next[id]);
      return changed ? next : prev;
    });

    // Update queue order
    setQueueOrder((prev) => {
      const next = [...globalQueueRef.current.queue];
      if (prev.length !== next.length) return next;
      const changed = prev.some((id, index) => next[index] !== id);
      return changed ? next : prev;
    });
  }, [philosopherIds]);

  /**
   * ADDRESSEE-ORDERED ENQUEUE
   *
   * Adds philosophers to the global queue in the order specified by addressees.
   * Implements deduplication: if a philosopher is already in the queue, they stay
   * in their original position and the new task is added to their pending list.
   *
   * @param addressees - Ordered list of philosopher IDs to enqueue
   * @param trigger - The message that triggered this response
   */
  const enqueueWithPriority = useCallback(
    (addressees: string[], trigger: MessageEvent) => {
      if (!addressees.length) return;

      addressees.forEach((addresseeId) => {
        // Validate addressee is a real philosopher
        if (!philosopherMap.has(addresseeId)) return;

        // Create task for this addressee
        const now = Date.now();
        const task: ResponseTask = {
          id: `task-${addresseeId}-${trigger.id}-${now}-${Math.random().toString(36).slice(2, 6)}`,
          philosopherId: addresseeId,
          trigger,
        };

        // Add task to pending queue for batching
        const existing = globalQueueRef.current.pending.get(addresseeId) || [];
        globalQueueRef.current.pending.set(addresseeId, [...existing, task]);

        // Add to global queue ONLY if not already present (deduplication)
        if (!globalQueueRef.current.queue.includes(addresseeId)) {
          globalQueueRef.current.queue.push(addresseeId);
        }
      });

      updateQueueDepths();
      drainQueues();
    },
    [philosopherMap, updateQueueDepths]
  );

  const enqueueResponsesFromMessage = useCallback(
    (message: MessageEvent) => {
      if (processedMessagesRef.current.has(message.id)) return;
      processedMessagesRef.current.add(message.id);

      // Determine targets based on recipients
      const targets: string[] = [];

      if (message.recipients.includes('all')) {
        // Add all philosophers except the speaker
        philosopherIds.forEach((id) => {
          if (id !== message.speaker) {
            targets.push(id);
          }
        });
      } else {
        // Add specific recipients (preserving order)
        message.recipients.forEach((recipient) => {
          if (recipient !== message.speaker && philosopherMap.has(recipient)) {
            targets.push(recipient);
          }
        });
      }

      if (targets.length === 0) return;

      // Enqueue with addressee order preserved
      enqueueWithPriority(targets, message);
    },
    [philosopherIds, philosopherMap, enqueueWithPriority]
  );

  function drainQueues() {
    if (isPausedRef.current) return;

    // Process the first philosopher in the global queue
    if (globalQueueRef.current.queue.length > 0) {
      const nextPhilosopherId = globalQueueRef.current.queue[0];
      if (nextPhilosopherId) {
        void runQueue(nextPhilosopherId);
      }
    }
  }

  /**
   * SEQUENTIAL QUEUE PROCESSING
   *
   * This function enforces turn-taking by:
   * 1. Checking global lock (only one speaker at a time)
   * 2. Removing philosopher from global queue
   * 3. Dequeuing ALL pending tasks for this philosopher
   * 4. Processing them together as a batch
   * 5. Releasing lock and triggering next speaker
   */
  async function runQueue(philosopherId: string): Promise<void> {
    if (isPausedRef.current) return;
    if (globallyProcessingRef.current) return; // Global lock check
    if (processingRef.current[philosopherId]) return;

    // Get pending tasks from global queue
    const tasks = globalQueueRef.current.pending.get(philosopherId);
    if (!tasks || tasks.length === 0) return;

    // Remove philosopher from queue and clear their pending tasks
    globalQueueRef.current.queue = globalQueueRef.current.queue.filter(
      (id) => id !== philosopherId
    );
    globalQueueRef.current.pending.delete(philosopherId);
    updateQueueDepths();

    globallyProcessingRef.current = true; // Acquire global lock
    processingRef.current[philosopherId] = true;
    setCurrentSpeaker(philosopherId); // Set current speaker indicator
    try {
      await processBatchedTasks(tasks);
    } finally {
      processingRef.current[philosopherId] = false;
      globallyProcessingRef.current = false; // Release global lock
      setCurrentSpeaker(null); // Clear speaker indicator
      // Trigger next speaker
      drainQueues();
    }
  }

  /**
   * BATCHED TASK PROCESSING WITH WEB-SEARCH ENHANCEMENT
   *
   * Processes multiple queued messages together, allowing the agent
   * to respond comprehensively to all pending messages in one reply.
   * Before generating response, searches for relevant Chinese philosophical quotes.
   */
  async function processBatchedTasks(tasks: ResponseTask[]): Promise<void> {
    if (tasks.length === 0) return;

    const firstTask = tasks[0];
    if (!firstTask) return;

    const philosopher = philosopherMap.get(firstTask.philosopherId);
    if (!philosopher) return;

    // Aggregate all trigger messages
    const uniqueTriggers = Array.from(
      new Map(tasks.map((t) => [t.trigger.id, t.trigger])).values()
    );

    // Build comprehensive context with ALL messages
    const triggerText = uniqueTriggers
      .map((t) => `[${t.speaker}]: ${t.surface}`)
      .join('\n');

    const lastTrigger = uniqueTriggers[uniqueTriggers.length - 1];
    if (!lastTrigger) return;

    const context = assembleContextForPhilosopher(
      philosopher,
      memoriesRef.current,
      {
        recipients: uniqueTriggers.flatMap((t) => t.recipients),
        text: triggerText,
        timestamp: lastTrigger.timestamp,
        speaker: lastTrigger.speaker,
      },
      topicRef.current
    );

    onEventLog(`${formatTime(new Date().toISOString())} · routing → ${philosopher.name}`);

    // NEW: Search for relevant philosophical quote
    let quoteData: QuoteData | undefined;
    try {
      onEventLog(`${formatTime(new Date().toISOString())} · searching quotes...`);
      // Note: In a real implementation, this would call a backend endpoint
      // that uses the MCP Exa tool with a search query like:
      // `${philosopher.name} ${topicRef.current} classical Chinese philosophy quote`
      // For now, we'll skip the actual search and include a placeholder in the prompt.
      quoteData = undefined; // Placeholder for actual Exa integration
    } catch (error) {
      console.warn('Quote search failed:', error);
      // Continue without quote
    }

    try {
      // Enhance prompt with request for Chinese quote
      const enhancedPrompt = `${context.promptText}\n\nIMPORTANT: Please include a relevant quote from ${philosopher.name}'s teachings in your response. Provide the quote in classical Chinese, followed by English translation, and cite the source.`;

      const response = await sendMessageToBackend({
        messages: [{ role: 'user', content: enhancedPrompt }],
      });

      const { finalText, reasoning, addressees } = parseModelResponse(response.content);

      // Determine recipients: use addressees from response if provided, otherwise fall back to speakers + moderator
      let replyRecipients: string[];
      if (addressees && addressees.length > 0) {
        // Use addressees from philosopher's response, adding moderator
        replyRecipients = [...addressees, 'moderator'];
      } else {
        // Fallback: all speakers who sent messages + moderator
        const allSpeakers = new Set(uniqueTriggers.map((t) => t.speaker));
        replyRecipients = Array.from(allSpeakers).concat(['moderator']);
      }

      const replyTimestamp = new Date().toISOString();
      const replyMessage: MessageEvent = {
        id: `reply-${firstTask.philosopherId}-${Date.now()}`,
        type: 'message',
        speaker: philosopher.id,
        recipients: replyRecipients,
        phase: currentPhase,
        timestamp: replyTimestamp,
        surface: finalText,
        insight: reasoning,
        quote: quoteData,
        translations: { english: finalText },
      };

      onMessageCreated(replyMessage);
      onEventLog(
        `${formatTime(replyTimestamp)} · ${philosopher.name} → ${replyRecipients.join(', ')}`
      );

      const updatedMemory = {
        ...memoriesRef.current,
        store: {
          ...memoriesRef.current.store,
        },
      };

      // Store message in recipient memories
      replyMessage.recipients.forEach((recipientId) => {
        const existingList = updatedMemory.store[recipientId] || [];
        const entry = {
          id: replyMessage.id,
          timestamp: replyMessage.timestamp,
          speaker: replyMessage.speaker,
          recipients: replyMessage.recipients,
          message: replyMessage.surface,
          phase: replyMessage.phase,
        };

        const newList = [...existingList, entry];
        const trimmed =
          newList.length > memoriesRef.current.max
            ? newList.slice(-memoriesRef.current.max)
            : newList;
        updatedMemory.store[recipientId] = trimmed;
      });

      memoriesRef.current = updatedMemory;
      onMemoryUpdate(updatedMemory);

      const historyLines = buildHistoryLines(context, currentPhase);
      const contextMessages = historyLines.map((line) => ({
        id: line.id,
        speaker: line.speaker,
        phase: line.phase,
        surface: line.message,
        timestamp: line.timestamp,
      }));

      const firstUniqueTrigger = uniqueTriggers[0];
      if (!firstUniqueTrigger) return;

      const snapshot: InspectorSnapshot = {
        id: `ctx-${firstTask.philosopherId}-${Date.now()}`,
        type: 'context-snapshot',
        phase: currentPhase,
        timestamp: replyTimestamp,
        contextId: `session-${firstTask.philosopherId}`,
        round: messageCountRef.current + 1,
        audience: firstTask.philosopherId,
        userPrompt: triggerText,
        prompt: {
          templateId: 'confucian_cafe.prompt.dynamic',
          templateSkeleton: '',
          rendered: context.promptText,
        },
        contextMessages,
        callPayload: {
          recipient: firstTask.philosopherId,
          history: context.renderedHistory,
          historyEntries: contextMessages,
          latest: context.latestLine,
          triggerId: firstUniqueTrigger.id,
          final: finalText,
          reasoning: reasoning ?? undefined,
        },
      };

      messageCountRef.current++;
      onSnapshotCreated(snapshot);

      enqueueResponsesFromMessage(replyMessage);
    } catch (error) {
      console.error(error);
      onEventLog(
        `${formatTime(new Date().toISOString())} · backend error (${philosopher.name})`,
        { dedupe: true }
      );
      onBackendError(philosopher.id);
    }
  }

  // Initialize processing flags for new philosophers
  useEffect(() => {
    philosopherIds.forEach((id) => {
      if (typeof processingRef.current[id] !== 'boolean') {
        processingRef.current[id] = false;
      }
    });
    updateQueueDepths();
  }, [philosopherIds, updateQueueDepths]);

  // Sync refs with props
  useEffect(() => {
    memoriesRef.current = memories;
  }, [memories]);

  useEffect(() => {
    isPausedRef.current = isPaused;
    if (!isPaused) {
      drainQueues();
    }
  }, [isPaused]);

  useEffect(() => {
    topicRef.current = topic;
  }, [topic]);

  return {
    queueDepths,
    queueOrder,
    currentSpeaker,
    enqueueWithPriority,
    enqueueResponsesFromMessage,
    drainQueues,
  };
}
