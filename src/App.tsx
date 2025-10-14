import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { defaultPhilosophers } from './config/philosophers';
import {
  ComposerSubmission,
  InspectorSnapshot,
  MessageEvent,
  Phase,
  Philosopher,
  QuoteData,
} from './types';
import { formatDate, formatTime } from './lib/time';
import { healthCheck, sendMessageToBackend } from './lib/api';
import { createEmptyMemories, pushMemoryEntry } from './lib/memory';
import { assembleContextForPhilosopher } from './lib/context';
import { parseModelResponse } from './lib/parser';
import { buildHistoryLines } from './lib/history';
import { HeaderBand } from './components/HeaderBand/HeaderBand';
import { Sidebar } from './components/Sidebar/Sidebar';
import { DialogueStream } from './components/DialogueView/DialogueStream';
import { InspectorDrawer } from './components/Inspector/InspectorDrawer';
import { PhilosopherViewSidebar } from './components/PhilosopherView/PhilosopherViewSidebar';

import './styles/global.css';

type ResponseTask = {
  id: string;
  philosopherId: string;
  trigger: MessageEvent;
};

const App = () => {
  const [philosophers, setPhilosophers] = useState<Philosopher[]>(() =>
    defaultPhilosophers.map((philosopher) => ({ ...philosopher })),
  );
  const [activeIds, setActiveIds] = useState<string[]>(() =>
    ['confucius', 'laozi', 'mozi'].filter((id) =>
      defaultPhilosophers.some((philosopher) => philosopher.id === id),
    ),
  );
  const [topic, setTopic] = useState<string>('The Way');
  const [sessionDate] = useState<string>(() => new Date().toISOString());
  const [showInsights, setShowInsights] = useState(true);
  const [currentSpeaker, setCurrentSpeaker] = useState<string | null>(null);
  const [perspectiveMode, setPerspectiveMode] = useState<'moderator' | 'philosopher'>(
    'moderator',
  );
  const [selectedPhilosopherId, setSelectedPhilosopherId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageEvent[]>([]);
  const [snapshots, setSnapshots] = useState<InspectorSnapshot[]>([]);
  const [activeSnapshotId, setActiveSnapshotId] = useState<string | null>(null);
  const [eventFeed, setEventFeed] = useState<string[]>([]);
  const [queueDepths, setQueueDepths] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    defaultPhilosophers.forEach(({ id }) => {
      initial[id] = 0;
    });
    return initial;
  });
  const [queueOrder, setQueueOrder] = useState<string[]>([]);
  const currentPhase: Phase = 'introduce';
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [backendHealthy, setBackendHealthy] = useState<boolean | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [memories, setMemories] = useState(() => createEmptyMemories(defaultPhilosophers));

  const philosopherMap = useMemo(() => {
    const map = new Map<string, Philosopher>();
    philosophers.forEach((philosopher) => {
      map.set(philosopher.id, philosopher);
    });
    return map;
  }, [philosophers]);

  const philosopherIds = useMemo(
    () => philosophers.map((philosopher) => philosopher.id),
    [philosophers],
  );

  const appendEventFeed = useCallback(
    (entry: string, { dedupe = false }: { dedupe?: boolean } = {}) => {
      setEventFeed((prev) => {
        if (dedupe && prev[prev.length - 1] === entry) {
          return prev;
        }
        const next = [...prev, entry];
        return next.slice(-12);
      });
    },
    [],
  );

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

  useEffect(() => {
    // Initialize processing flags for new philosophers
    philosopherIds.forEach((id) => {
      if (typeof processingRef.current[id] !== 'boolean') {
        processingRef.current[id] = false;
      }
    });
    updateQueueDepths();
  }, [philosopherIds, updateQueueDepths]);

  useEffect(() => {
    setMemories((prev) => {
      const nextStore = { ...prev.store };
      let changed = false;
      if (!nextStore.all) {
        nextStore.all = [];
        changed = true;
      }
      philosopherIds.forEach((id) => {
        if (!nextStore[id]) {
          nextStore[id] = [];
          changed = true;
        }
      });
      if (!changed) {
        return prev;
      }
      const nextState = { ...prev, store: nextStore };
      memoriesRef.current = nextState;
      return nextState;
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
  function enqueueWithPriority(addressees: string[], trigger: MessageEvent) {
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
  }

  function enqueueResponsesFromMessage(message: MessageEvent) {
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
  }

  function drainQueues() {
    if (isPausedRef.current) return;

    // Process the first philosopher in the global queue
    if (globalQueueRef.current.queue.length > 0) {
      const nextPhilosopherId = globalQueueRef.current.queue[0];
      void runQueue(nextPhilosopherId);
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

    const philosopher = philosopherMap.get(tasks[0].philosopherId);
    if (!philosopher) return;

    // Aggregate all trigger messages
    const uniqueTriggers = Array.from(
      new Map(tasks.map((t) => [t.trigger.id, t.trigger])).values(),
    );

    // Build comprehensive context with ALL messages
    const triggerText = uniqueTriggers
      .map((t) => `[${t.speaker}]: ${t.surface}`)
      .join('\n');

    const context = assembleContextForPhilosopher(
      philosopher,
      memoriesRef.current,
      {
        recipients: uniqueTriggers.flatMap((t) => t.recipients),
        text: triggerText,
        timestamp: uniqueTriggers[uniqueTriggers.length - 1].timestamp,
        speaker: uniqueTriggers[uniqueTriggers.length - 1].speaker,
      },
      topicRef.current,
    );

    appendEventFeed(
      `${formatTime(new Date().toISOString())} · routing → ${philosopher.name}`,
    );

    // NEW: Search for relevant philosophical quote
    let quoteData: QuoteData | undefined;
    try {
      appendEventFeed(`${formatTime(new Date().toISOString())} · searching quotes...`);
      const searchQuery = `${philosopher.name} ${topicRef.current} classical Chinese philosophy quote`;

      // Note: In a real implementation, this would call a backend endpoint
      // that uses the MCP Exa tool. For now, we'll skip the actual search
      // and include a placeholder in the prompt for the model to provide quotes.
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
        id: `reply-${tasks[0].philosopherId}-${Date.now()}`,
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

      setMessages((prev) => [...prev, replyMessage]);
      appendEventFeed(
        `${formatTime(replyTimestamp)} · ${philosopher.name} → ${replyRecipients.join(', ')}`,
      );

      setMemories((prev) => {
        const next = pushMemoryEntry(prev, replyMessage);
        memoriesRef.current = next;
        return next;
      });

      const historyLines = buildHistoryLines(context, currentPhase);
      const contextMessages = historyLines.map((line) => ({
        id: line.id,
        speaker: line.speaker,
        phase: line.phase,
        surface: line.message,
        timestamp: line.timestamp,
      }));

      const snapshot: InspectorSnapshot = {
        id: `ctx-${tasks[0].philosopherId}-${Date.now()}`,
        type: 'context-snapshot',
        phase: currentPhase,
        timestamp: replyTimestamp,
        contextId: `session-${tasks[0].philosopherId}`,
        round: messages.length + 1,
        audience: tasks[0].philosopherId,
        userPrompt: triggerText,
        prompt: {
          templateId: 'confucian_cafe.prompt.dynamic',
          templateSkeleton: '',
          rendered: context.promptText,
        },
        contextMessages,
        callPayload: {
          recipient: tasks[0].philosopherId,
          history: context.renderedHistory,
          historyEntries: contextMessages,
          latest: context.latestLine,
          triggerId: uniqueTriggers[0].id,
          final: finalText,
          reasoning: reasoning ?? undefined,
        },
      };

      setSnapshots((prev) => [...prev, snapshot]);

      enqueueResponsesFromMessage(replyMessage);
    } catch (error) {
      console.error(error);
      appendEventFeed(
        `${formatTime(new Date().toISOString())} · backend error (${philosopher.name})`,
        { dedupe: true },
      );
    }
  }

  useEffect(() => {
    updateQueueDepths();
  }, [updateQueueDepths]);

  useEffect(() => {
    healthCheck()
      .then(setBackendHealthy)
      .catch(() => setBackendHealthy(false));
  }, []);

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

  const roster = useMemo(
    () => philosophers.filter((philosopher) => activeIds.includes(philosopher.id)),
    [philosophers, activeIds],
  );

  const toggleActive = (id: string) => {
    setActiveIds((prev) =>
      prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id],
    );
  };

  const handlePrompt = ({ prompt, recipients }: ComposerSubmission) => {
    const trimmed = prompt.trim();
    if (!trimmed || recipients.length === 0) return;

    const timestamp = new Date().toISOString();
    const userMessage: MessageEvent = {
      id: `user-${Date.now()}`,
      type: 'message',
      speaker: 'moderator',
      recipients,
      phase: currentPhase,
      timestamp,
      surface: trimmed,
      translations: { english: trimmed },
    };

    setMessages((prev) => [...prev, userMessage]);
    appendEventFeed(`${formatTime(timestamp)} · moderator → ${recipients.join(', ')}`);

    setMemories((prev) => {
      const next = pushMemoryEntry(prev, userMessage);
      memoriesRef.current = next;
      return next;
    });

    enqueueResponsesFromMessage(userMessage);
  };

  const handleAddPhilosopher = (philosopher: Philosopher) => {
    setPhilosophers((prev) => [...prev, philosopher]);
    setActiveIds((prev) =>
      prev.includes(philosopher.id) ? prev : [...prev, philosopher.id],
    );
    setQueueDepths((prev) => ({
      ...prev,
      [philosopher.id]: globalQueueRef.current.pending.get(philosopher.id)?.length ?? 0,
    }));
    appendEventFeed(
      `${formatTime(new Date().toISOString())} · system → ${philosopher.name} joined`,
    );
  };

  const handleUpdatePhilosopher = (updatedPhilosopher: Philosopher) => {
    setPhilosophers((prev) =>
      prev.map((philosopher) =>
        philosopher.id === updatedPhilosopher.id ? updatedPhilosopher : philosopher,
      ),
    );
    appendEventFeed(
      `${formatTime(new Date().toISOString())} · system → ${updatedPhilosopher.name} config updated`,
    );
  };

  const handleTogglePause = () => {
    setIsPaused((prev) => {
      const next = !prev;
      const label = next ? 'auto-responses paused' : 'auto-responses resumed';
      appendEventFeed(`${formatTime(new Date().toISOString())} · system → ${label}`, {
        dedupe: true,
      });
      return next;
    });
  };

  return (
    <div className="app-shell">
      <HeaderBand
        inspectorOpen={inspectorOpen}
        onToggleInspector={() => setInspectorOpen((prev) => !prev)}
        backendHealthy={backendHealthy}
        isPaused={isPaused}
        onTogglePause={handleTogglePause}
      />

      <div
        className={`main-frame ${perspectiveMode === 'philosopher' ? 'with-philosopher-view' : ''}`}
      >
        <Sidebar
          philosophers={philosophers}
          activeIds={activeIds}
          onToggle={toggleActive}
          topic={topic}
          onTopicChange={setTopic}
          showInsights={showInsights}
          onToggleInsights={setShowInsights}
          eventFeed={eventFeed}
          queueDepths={queueDepths}
          queueOrder={queueOrder}
          onAddPhilosopher={handleAddPhilosopher}
          onUpdatePhilosopher={handleUpdatePhilosopher}
        />

        <section className={`dialogue-board ${inspectorOpen ? 'inspector-visible' : ''}`}>
          <DialogueStream
            topic={topic}
            date={formatDate(sessionDate)}
            messages={messages}
            roster={roster}
            participants={philosophers}
            showInsights={showInsights}
            currentSpeaker={currentSpeaker}
            perspectiveMode={perspectiveMode}
            selectedPhilosopherId={selectedPhilosopherId}
            onPerspectiveModeChange={setPerspectiveMode}
            onPhilosopherSelect={setSelectedPhilosopherId}
            onSendPrompt={handlePrompt}
          />

          <InspectorDrawer
            open={inspectorOpen}
            snapshots={snapshots}
            activeSnapshotId={activeSnapshotId}
            onSelectSnapshot={setActiveSnapshotId}
            messages={messages}
            onClose={() => setInspectorOpen(false)}
          />
        </section>

        {perspectiveMode === 'philosopher' && selectedPhilosopherId && (
          <PhilosopherViewSidebar
            philosopherId={selectedPhilosopherId}
            philosopher={philosophers.find((p) => p.id === selectedPhilosopherId)!}
            messages={messages}
            participants={philosophers}
            showInsights={showInsights}
            onClose={() => setPerspectiveMode('moderator')}
          />
        )}
      </div>
    </div>
  );
};

export default App;
