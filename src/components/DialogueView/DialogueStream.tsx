import type { Philosopher, MessageEvent, ComposerSubmission } from '../../types';
import { MessageCard } from './MessageCard';
import { PromptComposer } from './PromptComposer';
import styles from './DialogueStream.module.css';

interface DialogueStreamProps {
  topic: string;
  date: string;
  messages: MessageEvent[];
  roster: Philosopher[];
  participants: Philosopher[];
  showInsights: boolean;
  currentSpeaker: string | null;
  perspectiveMode: 'moderator' | 'philosopher';
  selectedPhilosopherId: string | null;
  onPerspectiveModeChange: (mode: 'moderator' | 'philosopher') => void;
  onPhilosopherSelect: (id: string | null) => void;
  onSendPrompt: (submission: ComposerSubmission) => void;
}

export const DialogueStream = ({
  topic,
  date,
  messages,
  roster,
  participants,
  showInsights,
  currentSpeaker,
  perspectiveMode,
  selectedPhilosopherId,
  onPerspectiveModeChange,
  onPhilosopherSelect,
  onSendPrompt,
}: DialogueStreamProps) => {
  const speakerName = currentSpeaker
    ? participants.find((p) => p.id === currentSpeaker)?.name || currentSpeaker
    : null;

  return (
    <>
      <div className={styles.dialogueHeader}>
        <div>
          <h3>Dialogue Stream</h3>
          <span className={styles.dialogueTopic}>
            Topic: {topic} · {date}
          </span>
        </div>
        <div className={styles.dialogueMeta}>
          {speakerName ? (
            <span className={styles.turnIndicator}>🎤 {speakerName} is speaking...</span>
          ) : (
            <span>Active philosophers: {roster.length}</span>
          )}
        </div>
      </div>

      {/* Perspective Selector */}
      <div className={styles.perspectiveSelector}>
        <div className={styles.toggleBar}>
          <button
            className={`${styles.pill} ${perspectiveMode === 'moderator' ? styles.active : ''}`}
            onClick={() => onPerspectiveModeChange('moderator')}
            type="button"
          >
            Moderator View
          </button>
          <button
            className={`${styles.pill} ${perspectiveMode === 'philosopher' ? styles.active : ''}`}
            onClick={() => {
              onPerspectiveModeChange('philosopher');
              if (!selectedPhilosopherId && roster.length > 0) {
                onPhilosopherSelect(roster[0].id);
              }
            }}
            type="button"
          >
            Open Philosopher View →
          </button>
        </div>
        {perspectiveMode === 'philosopher' && (
          <select
            value={selectedPhilosopherId || ''}
            onChange={(e) => onPhilosopherSelect(e.target.value)}
            className={styles.philosopherSelect}
          >
            {roster.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <ol className={styles.messageList}>
        {messages.map((message) => (
          <MessageCard
            key={message.id}
            message={message}
            showInsights={showInsights}
            participants={participants}
            highlightReasoning={false}
          />
        ))}
        {messages.length === 0 && (
          <li className={styles.welcomeMessage}>
            <div className={styles.welcomeHeader}>
              <h2>🏮 Welcome to Confucian Café 🏮</h2>
              <p className={styles.welcomeSubtitle}>
                Where ancient wisdom meets modern dialogue
              </p>
            </div>

            <div className={styles.welcomeSection}>
              <h3>✨ What is this place?</h3>
              <p>
                Step into a philosophical tea house where great thinkers of ancient China
                gather to debate, discuss, and deliberate on the pressing matters of
                governance, ethics, and society. Each philosopher brings their unique
                perspective—from Confucius's ritual propriety to Laozi's water-like
                wisdom, from Mozi's utilitarian calculations to the diverse Confucian
                voices of Mencius and Xunzi.
              </p>
            </div>

            <div className={styles.welcomeSection}>
              <h3>🎭 How does it work?</h3>
              <ul className={styles.welcomeList}>
                <li>
                  <strong>Sequential Dialogue:</strong> Only one philosopher speaks at a
                  time—just like a real council meeting! Each thinker processes all
                  pending questions before responding comprehensively.
                </li>
                <li>
                  <strong>Perspective Views:</strong> Toggle between Moderator View (see
                  everything) and Philosopher View (experience the dialogue from a single
                  philosopher's first-person perspective).
                </li>
                <li>
                  <strong>Internal Reasoning:</strong> Enable "Show reasoning" in Controls
                  to peek behind the curtain and see how each philosopher thinks through
                  their responses.
                </li>
                <li>
                  <strong>Topic-Driven:</strong> Set any topic you wish to explore—from
                  flood control to education reform, from virtue ethics to political
                  legitimacy.
                </li>
              </ul>
            </div>

            <div className={styles.welcomeSection}>
              <h3>🚀 Getting Started</h3>
              <ol className={styles.welcomeList}>
                <li>
                  Choose your <strong>Roster</strong> in the left panel—select which
                  philosophers join the discussion
                </li>
                <li>
                  Set your <strong>Topic</strong> in the Controls tab—what should they
                  debate?
                </li>
                <li>
                  Address the philosophers below—select one, some, or the entire council
                </li>
                <li>
                  Watch the dialogue unfold as each thinker responds in their unique voice
                </li>
                <li>
                  Switch to <strong>Philosopher View</strong> above to experience the
                  conversation from their eyes
                </li>
              </ol>
            </div>

            <div className={styles.welcomeSection}>
              <h3>💡 Pro Tips</h3>
              <ul className={styles.welcomeList}>
                <li>
                  Ask philosophers to <strong>respond to each other</strong>{' '}
                  directly—they'll cite and critique!
                </li>
                <li>
                  Use the <strong>Inspector</strong> (top-right button) to see the exact
                  prompts sent to each agent
                </li>
                <li>
                  Watch the <strong>Events</strong> tab to track the routing and timing of
                  each response
                </li>
                <li>
                  Try <strong>adding new participants</strong>—bring in other voices from
                  Chinese philosophy!
                </li>
                <li>
                  <strong>Pause auto-responses</strong> if you want to read and reflect
                  before the next turn
                </li>
              </ul>
            </div>

            <div className={styles.welcomeFooter}>
              <p>
                Ready to begin? Compose your first prompt below, select your recipients,
                and let the philosophical discourse commence! 🍵
              </p>
            </div>
          </li>
        )}
      </ol>

      <PromptComposer roster={roster} onSubmit={onSendPrompt} />
    </>
  );
};
