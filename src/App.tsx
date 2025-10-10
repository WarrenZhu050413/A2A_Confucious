import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { mockPhilosophers } from './data/mockData';
import {
  ComposerSubmission,
  InspectorSnapshot,
  MessageEvent,
  Phase,
  Philosopher,
} from './types';
import { formatDate, formatTime } from './lib/time';
import { healthCheck, sendMessageToBackend } from './lib/api';
import { createEmptyMemories, pushMemoryEntry } from './lib/memory';
import { assembleContextForPhilosopher, type AssembledContext } from './lib/context';
import type { QuoteData } from './types';
import './styles/app.css';

type ResponseTask = {
  id: string;
  philosopherId: string;
  trigger: MessageEvent;
};

const parseModelResponse = (raw: string) => {
  const fallback = typeof raw === 'string' ? raw.trim() : '';
  let finalText = fallback;
  let reasoning: string | undefined;

  if (typeof raw === 'string') {
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const candidate = raw.slice(firstBrace, lastBrace + 1);
      try {
        const parsed = JSON.parse(candidate);
        const maybeFinal = parsed.final ?? parsed.answer ?? parsed.response ?? parsed.surface;
        const maybeReasoning = parsed.reasoning ?? parsed.analysis ?? parsed.thinking;
        if (typeof maybeFinal === 'string' && maybeFinal.trim()) {
          finalText = maybeFinal.trim();
        }
        if (typeof maybeReasoning === 'string' && maybeReasoning.trim()) {
          reasoning = maybeReasoning.trim();
        }
      } catch {
        // ignore parse failure, fall back to raw text
      }
    }
  }

  if (!reasoning && typeof raw === 'string') {
    const normalized = raw.replace(/\r\n/g, '\n');
    const separatorIndex = normalized.indexOf('\n\n');
    if (separatorIndex !== -1) {
      const leading = normalized.slice(0, separatorIndex).trim();
      const trailing = normalized.slice(separatorIndex + 2).trim();
      if (leading && trailing) {
        reasoning = leading;
        finalText = trailing;
      }
    }
  }

  return { finalText, reasoning };
};

type HistoryLine = {
  id: string;
  timestamp: string;
  speaker: string;
  message: string;
  phase: Phase;
};

const buildHistoryLines = (context: AssembledContext, fallbackPhase: Phase): HistoryLine[] => {
  if (context.historyEntries && context.historyEntries.length) {
    return context.historyEntries.map(entry => ({
      id: entry.id ?? `history-${entry.timestamp}-${entry.speaker}`,
      timestamp: entry.timestamp,
      speaker: entry.speaker,
      message: entry.message,
      phase: entry.phase ?? fallbackPhase,
    }));
  }

  return context.renderedHistory
    .split('\n')
    .map(line => line.trim())
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

const App = () => {
  const [philosophers, setPhilosophers] = useState<Philosopher[]>(() =>
    mockPhilosophers.map(philosopher => ({ ...philosopher })),
  );
  const [activeIds, setActiveIds] = useState<string[]>(() =>
    ['confucius', 'laozi', 'mozi'].filter(id =>
      mockPhilosophers.some(philosopher => philosopher.id === id),
    ),
  );
  const [topic, setTopic] = useState<string>('Water Control Ethics');
  const [sessionDate] = useState<string>(() => new Date().toISOString());
  const [showInsights, setShowInsights] = useState(true);
  const [currentSpeaker, setCurrentSpeaker] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageEvent[]>([]);
  const [snapshots, setSnapshots] = useState<InspectorSnapshot[]>([]);
  const [activeSnapshotId, setActiveSnapshotId] = useState<string | null>(null);
  const [eventFeed, setEventFeed] = useState<string[]>([]);
  const [queueDepths, setQueueDepths] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    mockPhilosophers.forEach(({ id }) => {
      initial[id] = 0;
    });
    return initial;
  });
  const currentPhase: Phase = 'introduce';
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [backendHealthy, setBackendHealthy] = useState<boolean | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [memories, setMemories] = useState(() => createEmptyMemories(mockPhilosophers));

  const philosopherMap = useMemo(() => {
    const map = new Map<string, Philosopher>();
    philosophers.forEach(philosopher => {
      map.set(philosopher.id, philosopher);
    });
    return map;
  }, [philosophers]);

  const philosopherIds = useMemo(() => philosophers.map(philosopher => philosopher.id), [philosophers]);

  const appendEventFeed = useCallback(
    (entry: string, { dedupe = false }: { dedupe?: boolean } = {}) => {
      setEventFeed(prev => {
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
    setQueueDepths(prev => {
      const next: Record<string, number> = {};
      philosopherIds.forEach(id => {
        next[id] = queuesRef.current[id]?.length ?? 0;
      });
      const prevKeys = Object.keys(prev);
      if (prevKeys.length !== philosopherIds.length) {
        return next;
      }
      const changed = philosopherIds.some(id => prev[id] !== next[id]);
      return changed ? next : prev;
    });
  }, [philosopherIds]);

  const queuesRef = useRef<Record<string, ResponseTask[]>>({});

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
    philosopherIds.forEach(id => {
      if (!queuesRef.current[id]) {
        queuesRef.current[id] = [];
      }
      if (typeof processingRef.current[id] !== 'boolean') {
        processingRef.current[id] = false;
      }
    });
    updateQueueDepths();
  }, [philosopherIds, updateQueueDepths]);

  useEffect(() => {
    setMemories(prev => {
      const nextStore = { ...prev.store };
      let changed = false;
      if (!nextStore.all) {
        nextStore.all = [];
        changed = true;
      }
      philosopherIds.forEach(id => {
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

  function deriveReplyRecipients(task: ResponseTask): string[] {
    const recipients = new Set<string>();
    const trigger = task.trigger;

    if (trigger.recipients.includes('all')) {
      philosopherIds.forEach(id => {
        if (id !== task.philosopherId) {
          recipients.add(id);
        }
      });
    }

    trigger.recipients.forEach(recipient => {
      if (recipient !== 'all' && recipient !== task.philosopherId && philosopherMap.has(recipient)) {
        recipients.add(recipient);
      }
    });

    if (trigger.speaker !== task.philosopherId && philosopherMap.has(trigger.speaker)) {
      recipients.add(trigger.speaker);
    }

    recipients.add('moderator');

    return Array.from(recipients);
  }

  function enqueueTasks(tasks: ResponseTask[]) {
    if (!tasks.length) return;
    tasks.forEach(task => {
      if (!queuesRef.current[task.philosopherId]) {
        queuesRef.current[task.philosopherId] = [];
      }
      queuesRef.current[task.philosopherId].push(task);
    });
    updateQueueDepths();
    drainQueues();
  }

  function enqueueResponsesFromMessage(message: MessageEvent) {
    if (processedMessagesRef.current.has(message.id)) return;
    processedMessagesRef.current.add(message.id);

    const targets = new Set<string>();
    message.recipients.forEach(recipient => {
      if (recipient !== message.speaker && philosopherMap.has(recipient)) {
        targets.add(recipient);
      }
    });

    if (message.recipients.includes('all')) {
      philosopherIds.forEach(id => {
        if (id !== message.speaker) {
          targets.add(id);
        }
      });
    }

    if (targets.size === 0) return;

    const now = Date.now();
    const tasks: ResponseTask[] = Array.from(targets).map(targetId => ({
      id: `task-${targetId}-${message.id}-${now}-${Math.random().toString(36).slice(2, 6)}`,
      philosopherId: targetId,
      trigger: message,
    }));

    enqueueTasks(tasks);
  }

  function drainQueues() {
    if (isPausedRef.current) return;
    philosopherIds.forEach(id => {
      void runQueue(id);
    });
  }

  /**
   * SEQUENTIAL QUEUE PROCESSING
   *
   * This function enforces turn-taking by:
   * 1. Checking global lock (only one speaker at a time)
   * 2. Dequeuing ALL tasks for this philosopher
   * 3. Processing them together as a batch
   * 4. Releasing lock and triggering next speaker
   */
  async function runQueue(philosopherId: string): Promise<void> {
    if (isPausedRef.current) return;
    if (globallyProcessingRef.current) return; // NEW: global lock check
    if (processingRef.current[philosopherId]) return;

    const queue = queuesRef.current[philosopherId];
    if (!queue || queue.length === 0) return;

    // NEW: Dequeue ALL tasks for comprehensive response
    const tasks = [...queue];
    queuesRef.current[philosopherId] = [];
    updateQueueDepths();

    if (tasks.length === 0) return;

    globallyProcessingRef.current = true; // NEW: acquire global lock
    processingRef.current[philosopherId] = true;
    setCurrentSpeaker(philosopherId); // NEW: set current speaker indicator
    try {
      await processBatchedTasks(tasks);
    } finally {
      processingRef.current[philosopherId] = false;
      globallyProcessingRef.current = false; // NEW: release global lock
      setCurrentSpeaker(null); // NEW: clear speaker indicator
      // NEW: Trigger next speaker
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
      new Map(tasks.map(t => [t.trigger.id, t.trigger])).values()
    );

    // Build comprehensive context with ALL messages
    const triggerText = uniqueTriggers
      .map(t => `[${t.speaker}]: ${t.surface}`)
      .join('\n');

    const context = assembleContextForPhilosopher(philosopher, memoriesRef.current, {
      recipients: uniqueTriggers.flatMap(t => t.recipients),
      text: triggerText,
      timestamp: uniqueTriggers[uniqueTriggers.length - 1].timestamp,
      speaker: uniqueTriggers[uniqueTriggers.length - 1].speaker,
    });

    appendEventFeed(`${formatTime(new Date().toISOString())} · routing → ${philosopher.name}`);

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

      const { finalText, reasoning } = parseModelResponse(response.content);

      // Determine recipients: all speakers who sent messages + moderator
      const allSpeakers = new Set(uniqueTriggers.map(t => t.speaker));
      const replyRecipients = Array.from(allSpeakers).concat(['moderator']);

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

      setMessages(prev => [...prev, replyMessage]);
      appendEventFeed(
        `${formatTime(replyTimestamp)} · ${philosopher.name} → ${replyRecipients.join(', ')}`,
      );

      setMemories(prev => {
        const next = pushMemoryEntry(prev, replyMessage);
        memoriesRef.current = next;
        return next;
      });

      const historyLines = buildHistoryLines(context, currentPhase);
      const contextMessages = historyLines.map(line => ({
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

      setSnapshots(prev => [...prev, snapshot]);

      enqueueResponsesFromMessage(replyMessage);
    } catch (error) {
      console.error(error);
      appendEventFeed(
        `${formatTime(new Date().toISOString())} · backend error (${philosopher.name})`,
        { dedupe: true },
      );
    }
  }

  // Legacy single-task processor (kept for reference, not used in sequential mode)
  async function processTask(task: ResponseTask) {
    const philosopher = philosopherMap.get(task.philosopherId);
    if (!philosopher) return;

    const context = assembleContextForPhilosopher(philosopher, memoriesRef.current, {
      recipients: task.trigger.recipients,
      text: task.trigger.surface,
      timestamp: task.trigger.timestamp,
      speaker: task.trigger.speaker,
    });

    appendEventFeed(`${formatTime(new Date().toISOString())} · routing → ${philosopher.name}`);

    try {
      const response = await sendMessageToBackend({
        messages: [{ role: 'user', content: context.promptText }],
      });

      const { finalText, reasoning } = parseModelResponse(response.content);
      const replyRecipients = deriveReplyRecipients(task);
      const replyTimestamp = new Date().toISOString();
      const replyMessage: MessageEvent = {
        id: `reply-${task.philosopherId}-${Date.now()}`,
        type: 'message',
        speaker: philosopher.id,
        recipients: replyRecipients,
        phase: currentPhase,
        timestamp: replyTimestamp,
        surface: finalText,
        insight: reasoning,
        translations: { english: finalText },
      };

      setMessages(prev => [...prev, replyMessage]);
      appendEventFeed(
        `${formatTime(replyTimestamp)} · ${philosopher.name} → ${replyRecipients.join(', ')}`,
      );

      setMemories(prev => {
        const next = pushMemoryEntry(prev, replyMessage);
        memoriesRef.current = next;
        return next;
      });

      const historyLines = buildHistoryLines(context, currentPhase);

      const contextMessages = historyLines.map(line => ({
        id: line.id,
        speaker: line.speaker,
        phase: line.phase,
        surface: line.message,
        timestamp: line.timestamp,
      }));

      const snapshot: InspectorSnapshot = {
        id: `ctx-${task.philosopherId}-${Date.now()}`,
        type: 'context-snapshot',
        phase: currentPhase,
        timestamp: replyTimestamp,
        contextId: `session-${task.philosopherId}`,
        round: messages.length + 1,
        audience: task.philosopherId,
        userPrompt: task.trigger.surface,
        prompt: {
          templateId: 'confucian_cafe.prompt.dynamic',
          templateSkeleton: '',
          rendered: context.promptText,
        },
        contextMessages,
        callPayload: {
          recipient: task.philosopherId,
          history: context.renderedHistory,
          historyEntries: contextMessages,
          latest: context.latestLine,
          triggerId: task.trigger.id,
          final: finalText,
          reasoning: reasoning ?? undefined,
        },
      };

      setSnapshots(prev => [...prev, snapshot]);

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
    healthCheck().then(setBackendHealthy).catch(() => setBackendHealthy(false));
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
    () => philosophers.filter(philosopher => activeIds.includes(philosopher.id)),
    [philosophers, activeIds],
  );

  const toggleActive = (id: string) => {
    setActiveIds(prev =>
      prev.includes(id) ? prev.filter(entry => entry !== id) : [...prev, id],
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

    setMessages(prev => [...prev, userMessage]);
    appendEventFeed(`${formatTime(timestamp)} · moderator → ${recipients.join(', ')}`);

    setMemories(prev => {
      const next = pushMemoryEntry(prev, userMessage);
      memoriesRef.current = next;
      return next;
    });

    enqueueResponsesFromMessage(userMessage);
  };

  const handleAddPhilosopher = (philosopher: Philosopher) => {
    setPhilosophers(prev => [...prev, philosopher]);
    setActiveIds(prev => (prev.includes(philosopher.id) ? prev : [...prev, philosopher.id]));
    setQueueDepths(prev => ({
      ...prev,
      [philosopher.id]: queuesRef.current[philosopher.id]?.length ?? 0,
    }));
    appendEventFeed(`${formatTime(new Date().toISOString())} · system → ${philosopher.name} joined`);
  };

  const handleTogglePause = () => {
    setIsPaused(prev => {
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
        onToggleInspector={() => setInspectorOpen(prev => !prev)}
        backendHealthy={backendHealthy}
        isPaused={isPaused}
        onTogglePause={handleTogglePause}
      />

      <div className="main-frame">
        <SideColumn
          philosophers={philosophers}
          activeIds={activeIds}
          onToggle={toggleActive}
          topic={topic}
          onTopicChange={setTopic}
          showInsights={showInsights}
          onToggleInsights={setShowInsights}
          eventFeed={eventFeed}
          queueDepths={queueDepths}
          onAddPhilosopher={handleAddPhilosopher}
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
      </div>
    </div>
  );
};

export default App;

const HeaderBand = ({
  inspectorOpen,
  onToggleInspector,
  backendHealthy,
  isPaused,
  onTogglePause,
}: {
  inspectorOpen: boolean;
  onToggleInspector: () => void;
  backendHealthy: boolean | null;
  isPaused: boolean;
  onTogglePause: () => void;
}) => {
  const backendStatusClass =
    backendHealthy === null ? 'pending' : backendHealthy ? 'online' : 'offline';
  return (
    <header className="header-band">
      <div>
        <h1>Confucian Café · Dialogue Orchestrator</h1>
        <p className="header-subline">
          Sequential philosophical dialogue with web-enhanced responses
        </p>
      </div>
      <div className="toggle-bar">
        <button className="inspector-toggle" onClick={onToggleInspector}>
          {inspectorOpen ? 'Hide Inspector' : 'Show Inspector'}
        </button>
        <button className="pause-toggle" onClick={onTogglePause} type="button">
          {isPaused ? 'Resume auto-responses' : 'Pause auto-responses'}
        </button>
        <span className={`status-chip ${isPaused ? 'paused' : 'active'}`}>
          {isPaused ? 'Paused' : 'Live'}
        </span>
        <span className={`backend-dot ${backendStatusClass}`} />
      </div>
    </header>
  );
};

const SideColumn = ({
  philosophers,
  activeIds,
  onToggle,
  topic,
  onTopicChange,
  showInsights,
  onToggleInsights,
  eventFeed,
  queueDepths,
  onAddPhilosopher,
}: {
  philosophers: Philosopher[];
  activeIds: string[];
  onToggle: (id: string) => void;
  topic: string;
  onTopicChange: (topic: string) => void;
  showInsights: boolean;
  onToggleInsights: (value: boolean) => void;
  eventFeed: string[];
  queueDepths: Record<string, number>;
  onAddPhilosopher: (philosopher: Philosopher) => void;
}) => {
  const [activeTab, setActiveTab] = useState<'roster' | 'controls' | 'events'>('roster');
  const selected = philosophers.filter(philosopher => activeIds.includes(philosopher.id));

  return (
    <aside className="roster-column">
      <div className="tab-bar">
        <button
          className={activeTab === 'roster' ? 'active' : ''}
          onClick={() => setActiveTab('roster')}
          type="button"
        >
          Roster
        </button>
        <button
          className={activeTab === 'controls' ? 'active' : ''}
          onClick={() => setActiveTab('controls')}
          type="button"
        >
          Controls
        </button>
        <button
          className={activeTab === 'events' ? 'active' : ''}
          onClick={() => setActiveTab('events')}
          type="button"
        >
          Events
        </button>
      </div>

      <div className="tab-panel">
        {activeTab === 'roster' && (
          <>
            <div className="toggle-bar">
              {philosophers.map(philosopher => (
                <button
                  key={philosopher.id}
                  className={`pill ${activeIds.includes(philosopher.id) ? 'active' : ''}`}
                  onClick={() => onToggle(philosopher.id)}
                  type="button"
                >
                  <span>{philosopher.name}</span>
                  {queueDepths[philosopher.id] > 0 && (
                    <span className="queue-count">{queueDepths[philosopher.id]}</span>
                  )}
                </button>
              ))}
            </div>

            {selected.length === 0 && (
              <div className="card">
                <strong>No philosophers selected</strong>
                <span>Toggle a name above to add them back into the session.</span>
              </div>
            )}

            {selected.map(philosopher => (
              <div key={philosopher.id} className="card">
                <header>
                  <span>{philosopher.name}</span>
                  <div className="roster-meta">
                    <span className="roster-port">
                      {philosopher.school} · port {philosopher.port}
                    </span>
                    <span
                      className={`queue-chip ${queueDepths[philosopher.id] ? 'active' : ''}`}
                    >
                      Queue {queueDepths[philosopher.id] ?? 0}
                    </span>
                  </div>
                </header>
                <p>{philosopher.personaSummary}</p>
              </div>
            ))}
          </>
        )}

        {activeTab === 'controls' && (
          <>
            <div className="card">
              <strong>Dialogue Topic</strong>
              <input
                type="text"
                value={topic}
                onChange={(e) => onTopicChange(e.target.value)}
                placeholder="Enter dialogue topic..."
                className="topic-input"
              />
              <p>Define the central question or theme for this philosophical dialogue.</p>
            </div>

            <div className="card">
              <strong>Insights Visibility</strong>
              <div className="toggle-bar">
                <button
                  className={`pill ${showInsights ? 'active' : ''}`}
                  onClick={() => onToggleInsights(true)}
                  type="button"
                >
                  Show reasoning
                </button>
                <button
                  className={`pill ${!showInsights ? 'active' : ''}`}
                  onClick={() => onToggleInsights(false)}
                  type="button"
                >
                  Hide reasoning
                </button>
              </div>
              <p>Toggle whether internal reasoning appears alongside each reply in the transcript.</p>
            </div>

            <AddParticipantCard
              onAdd={onAddPhilosopher}
              existingIds={new Set(philosophers.map(philosopher => philosopher.id))}
            />
          </>
        )}

        {activeTab === 'events' && (
          <div className="card">
            <strong>Event Feed</strong>
            <div className="event-feed">
              {eventFeed.length === 0 && <span>Stream initializing…</span>}
              {eventFeed.map((entry, index) => (
                <span key={`${entry}-${index}`}>{entry}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};

const AddParticipantCard = ({
  onAdd,
  existingIds,
}: {
  onAdd: (philosopher: Philosopher) => void;
  existingIds: Set<string>;
}) => {
  const [form, setForm] = useState({
    name: '',
    id: '',
    school: '',
    port: '',
    personaSummary: '',
    personaTemplate: '',
  });
  const [error, setError] = useState<string | null>(null);

  const toSlug = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  const handleChange = (field: keyof typeof form) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm(prev => ({ ...prev, [field]: event.target.value }));
    };

  const handleSubmit = () => {
    const trimmedName = form.name.trim();
    const trimmedSummary = form.personaSummary.trim();
    const trimmedTemplate = form.personaTemplate.trim();
    const candidateId = toSlug(form.id.trim() || trimmedName);
    if (!trimmedName || !candidateId) {
      setError('Name and identifier are required.');
      return;
    }
    if (existingIds.has(candidateId)) {
      setError('Identifier already exists. Choose a unique value.');
      return;
    }
    const port = Number.parseInt(form.port.trim(), 10);
    if (Number.isNaN(port) || port <= 0) {
      setError('Port must be a positive number.');
      return;
    }
    if (!trimmedSummary || !trimmedTemplate) {
      setError('Persona summary and template cannot be empty.');
      return;
    }

    const newPhilosopher: Philosopher = {
      id: candidateId,
      name: trimmedName,
      school: form.school.trim() || '未分流派',
      port,
      personaSummary: trimmedSummary,
      personaTemplate: trimmedTemplate,
    };

    onAdd(newPhilosopher);
    setForm({ name: '', id: '', school: '', port: '', personaSummary: '', personaTemplate: '' });
    setError(null);
  };

  return (
    <div className="card add-philosopher-card">
      <strong>Add participant</strong>
      <p>Register a new persona to bring additional voices into the conversation.</p>
      {error && <span className="form-error">{error}</span>}
      <div className="add-form">
        <label>
          <span>Name</span>
          <input value={form.name} onChange={handleChange('name')} placeholder="Zengzi" />
        </label>
        <label>
          <span>Identifier (slug)</span>
          <input value={form.id} onChange={handleChange('id')} placeholder="zengzi" />
        </label>
        <label>
          <span>School / Tradition</span>
          <input value={form.school} onChange={handleChange('school')} placeholder="儒家" />
        </label>
        <label>
          <span>Port</span>
          <input value={form.port} onChange={handleChange('port')} placeholder="8010" />
        </label>
        <label>
          <span>Persona summary</span>
          <textarea
            value={form.personaSummary}
            onChange={handleChange('personaSummary')}
            placeholder="Concise description of this philosopher's focus."
          />
        </label>
        <label>
          <span>Persona template</span>
          <textarea
            value={form.personaTemplate}
            onChange={handleChange('personaTemplate')}
            placeholder="Full instruction prompt used when composing replies."
          />
        </label>
      </div>
      <button className="primary-button" onClick={handleSubmit} type="button">
        Add participant
      </button>
    </div>
  );
};

const DialogueStream = ({
  topic,
  date,
  messages,
  roster,
  participants,
  showInsights,
  currentSpeaker,
  onSendPrompt,
}: {
  topic: string;
  date: string;
  messages: MessageEvent[];
  roster: Philosopher[];
  participants: Philosopher[];
  showInsights: boolean;
  currentSpeaker: string | null;
  onSendPrompt: (submission: ComposerSubmission) => void;
}) => {
  const speakerName = currentSpeaker
    ? participants.find(p => p.id === currentSpeaker)?.name || currentSpeaker
    : null;
  return (
    <>
      <div className="dialogue-header">
        <div>
          <h3>Dialogue Stream</h3>
          <span className="dialogue-topic">Topic: {topic} · {date}</span>
        </div>
        <div className="dialogue-meta">
          {speakerName ? (
            <span className="turn-indicator">🎤 {speakerName} is speaking...</span>
          ) : (
            <span>Active philosophers: {roster.length}</span>
          )}
        </div>
      </div>

      <ol className="message-list">
        {messages.map(message => (
          <MessageCard
            key={message.id}
            message={message}
            showInsights={showInsights}
            participants={participants}
          />
        ))}
        {messages.length === 0 && (
          <li className="message">
            <div className="meta">
              <span>Waiting for events…</span>
            </div>
            <p>Mock SSE will stream sample dialogue in a moment.</p>
          </li>
        )}
      </ol>

      <PromptComposer roster={roster} onSubmit={onSendPrompt} />
    </>
  );
};

const MessageCard = ({
  message,
  showInsights,
  participants,
}: {
  message: MessageEvent;
  showInsights: boolean;
  participants: Philosopher[];
}) => {
  const speaker = participants.find(philosopher => philosopher.id === message.speaker);
  const recipientLabels = message.recipients.map(recipient => {
    if (recipient === 'moderator') {
      return 'moderator';
    }
    const match = participants.find(philosopher => philosopher.id === recipient);
    return match?.name || recipient;
  });

  return (
    <li className="message">
      <div className="meta">
        <span>
          {(speaker?.name || message.speaker)} · {formatTime(message.timestamp)} · →{' '}
          {recipientLabels.join(', ')}
        </span>
      </div>
      <p>{message.surface}</p>
      {message.quote && (
        <details className="quote-block" open>
          <summary>📜 Classical Quote</summary>
          <div className="chinese-quote">{message.quote.chinese}</div>
          <div className="english-translation">{message.quote.english}</div>
          <cite className="quote-source">— {message.quote.source}</cite>
        </details>
      )}
      {showInsights && message.insight && (
        <details className="insight" open>
          <summary>Internal thoughts</summary>
          <p>{message.insight}</p>
        </details>
      )}
    </li>
  );
};

const PromptComposer = ({
  onSubmit,
  roster,
}: {
  onSubmit: (submission: ComposerSubmission) => void;
  roster: Philosopher[];
}) => {
  const [prompt, setPrompt] = useState('');
  const [recipients, setRecipients] = useState<string[]>(['confucius', 'laozi', 'mozi']);

  useEffect(() => {
    setRecipients(prev => {
      const valid = prev.filter(id => roster.some(philosopher => philosopher.id === id));
      const missing = roster
        .map(philosopher => philosopher.id)
        .filter(id => !valid.includes(id));
      if (
        missing.length === 0 &&
        valid.length === prev.length &&
        valid.every((id, index) => id === prev[index])
      ) {
        return prev;
      }
      return [...valid, ...missing];
    });
  }, [roster]);

  const toggleRecipient = (id: string) => {
    setRecipients(prev =>
      prev.includes(id) ? prev.filter(entry => entry !== id) : [...prev, id],
    );
  };

  const selectAll = () => {
    const allIds = roster.map(philosopher => philosopher.id);
    setRecipients(allIds);
  };

  const handleSubmit = () => {
    onSubmit({ prompt, recipients });
    setPrompt('');
  };

  const disableSubmit = prompt.trim().length === 0 || recipients.length === 0;

  return (
    <div className="prompt-composer">
      <label>
        <strong>User Prompt Composer</strong>
      </label>
      <textarea
        value={prompt}
        onChange={event => setPrompt(event.target.value)}
        placeholder="Address one or more philosophers by name, pose a question, or request synthesis…"
      />
      <div className="actions">
        <div className="toggle-bar">
          <button className={`pill`} onClick={selectAll} type="button">
            Address entire council
          </button>
          {roster.map(philosopher => (
            <button
              key={philosopher.id}
              className={`pill ${recipients.includes(philosopher.id) ? 'active' : ''}`}
              onClick={() => toggleRecipient(philosopher.id)}
              type="button"
            >
              {philosopher.name}
            </button>
          ))}
        </div>
        <button className="primary-button" onClick={handleSubmit} disabled={disableSubmit} type="button">
          Send Prompt
        </button>
      </div>
    </div>
  );
};

const InspectorDrawer = ({
  open,
  snapshots,
  activeSnapshotId,
  onSelectSnapshot,
  messages,
  onClose,
}: {
  open: boolean;
  snapshots: InspectorSnapshot[];
  activeSnapshotId: string | null;
  onSelectSnapshot: (id: string) => void;
  messages: MessageEvent[];
  onClose: () => void;
}) => {
  if (!open) return null;

  const orderedSnapshots = [...snapshots].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const activeSnapshot =
    orderedSnapshots.find(snapshot => snapshot.id === activeSnapshotId) ||
    orderedSnapshots[orderedSnapshots.length - 1];

  return (
    <div className={`inspector-drawer ${open ? 'open' : ''}`}>
      <div className="drawer-header">
        <div>
          <h3>Prompt Inspector</h3>
          <span className="badge">Transparency Log</span>
        </div>
        <button className="drawer-close" onClick={onClose} type="button">
          Close
        </button>
      </div>

      {orderedSnapshots.length === 0 ? (
        <p>No context snapshots yet. They will appear once the moderator prepares the first prompt.</p>
      ) : (
        <div className="drawer-content">
          <div className="snapshot-selector">
            {orderedSnapshots.map(snapshot => (
              <button
                key={snapshot.id}
                className={`pill ${snapshot.id === activeSnapshot?.id ? 'active' : ''}`}
                onClick={() => onSelectSnapshot(snapshot.id)}
                type="button"
              >
                Round {snapshot.round} → {snapshot.audience}
              </button>
            ))}
          </div>

          {activeSnapshot && (
            <SnapshotDetails snapshot={activeSnapshot} messages={messages} />
          )}
        </div>
      )}
    </div>
  );
};

const SnapshotDetails = ({
  snapshot,
  messages,
}: {
  snapshot: InspectorSnapshot;
  messages: MessageEvent[];
}) => {
  const recordedAt = new Date(snapshot.timestamp).toLocaleString();
  const messageMap = new Map(messages.map(message => [message.id, message]));
  const missing = snapshot.contextMessages.filter(entry => !messageMap.has(entry.id));
  const latestExchange = snapshot.callPayload?.latest ?? null;

  const downloadText = (text: string, filename: string) => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="prompt-meta">
        <div>
          <strong>Context ID</strong> {snapshot.contextId}
        </div>
        <div>
          <strong>Audience</strong> {snapshot.audience}
        </div>
        <div>
          <strong>Round</strong> {snapshot.round}
        </div>
        <div>
          <strong>Recorded</strong> {recordedAt}
        </div>
        <div>
          <strong>User Prompt</strong> {snapshot.userPrompt}
        </div>
        {latestExchange && (
          <div>
            <strong>Latest Exchange</strong> {latestExchange}
          </div>
        )}
      </div>

      <div className="toggle-bar">
        <span className="pill">
          {missing.length === 0
            ? 'Context mirror in sync'
            : `Pending ${missing.length} message${missing.length === 1 ? '' : 's'} from stream`}
        </span>
      </div>

      <div className="inspector-actions">
        <button
          className="ghost-button"
          onClick={() => downloadText(snapshot.prompt.rendered, `${snapshot.id}_prompt.txt`)}
          type="button"
        >
          Download prompt
        </button>
        <button
          className="ghost-button secondary"
          onClick={() =>
            downloadText(snapshot.prompt.templateSkeleton, `${snapshot.id}_template.txt`)
          }
          type="button"
        >
          Download template
        </button>
      </div>

      <div>
        <strong>Instantiated Prompt</strong>
        <pre className="code-block">{snapshot.prompt.rendered}</pre>
      </div>

      {snapshot.callPayload && (
        <details className="insight">
          <summary>Call payload</summary>
          <pre className="code-block">{JSON.stringify(snapshot.callPayload, null, 2)}</pre>
        </details>
      )}

      <AgentLens snapshot={snapshot} messages={messages} />
    </>
  );
};

const AgentLens = ({
  snapshot,
  messages,
}: {
  snapshot: InspectorSnapshot;
  messages: MessageEvent[];
}) => {
  const messageMap = new Map(messages.map(message => [message.id, message]));
  const pending = snapshot.contextMessages.filter(entry => !messageMap.has(entry.id));

  return (
    <section>
      <strong>Agent Lens</strong>
      <div className="toggle-bar" style={{ margin: '6px 0' }}>
        <span className="pill">
          {pending.length === 0
            ? 'Mirror matches stream'
            : `Waiting on ${pending.length} transcript update${pending.length === 1 ? '' : 's'}`}
        </span>
      </div>
      <ul className="agent-context-list">
        {snapshot.contextMessages.length === 0 && (
          <li>
            <div>No prior statements; the agent only receives the user prompt.</div>
          </li>
        )}
        {snapshot.contextMessages.map(entry => (
          <li key={entry.id}>
            <div className="meta">
              {entry.speaker} · {formatTime(entry.timestamp)}
            </div>
            <div>{entry.surface}</div>
          </li>
        ))}
      </ul>
    </section>
  );
};
