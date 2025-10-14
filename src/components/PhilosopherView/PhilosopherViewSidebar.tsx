import type { MessageEvent, Philosopher } from '../../types';
import { formatTime } from '../../lib/time';
import styles from './PhilosopherViewSidebar.module.css';

interface PhilosopherViewSidebarProps {
  philosopherId: string;
  philosopher: Philosopher;
  messages: MessageEvent[];
  participants: Philosopher[];
  showInsights: boolean;
  onClose: () => void;
}

export const PhilosopherViewSidebar = ({
  philosopherId,
  philosopher,
  messages,
  participants,
  showInsights,
  onClose,
}: PhilosopherViewSidebarProps) => {
  // Direct messages: addressed to this philosopher
  const directMessages = messages.filter(
    (msg) =>
      msg.recipients.includes(philosopherId) ||
      msg.recipients.includes('all') ||
      msg.speaker === philosopherId,
  );

  // General chit-chat: messages not addressed to this philosopher
  const chitChatMessages = messages.filter(
    (msg) =>
      !msg.recipients.includes(philosopherId) &&
      !msg.recipients.includes('all') &&
      msg.speaker !== philosopherId,
  );

  return (
    <aside className={styles.philosopherSidebar}>
      <div className={styles.philosopherSidebarHeader}>
        <div>
          <h3>👁️ {philosopher.name}'s View</h3>
          <p className={styles.philosopherSubtitle}>First-person perspective</p>
        </div>
        <button className={styles.closeButton} onClick={onClose} type="button">
          ✕
        </button>
      </div>

      <div className={styles.philosopherInfoCard}>
        <strong>{philosopher.name}</strong>
        <p className={styles.schoolBadge}>{philosopher.school}</p>
        <p className={styles.personaText}>{philosopher.personaSummary}</p>
      </div>

      <div className={styles.philosopherContent}>
        {/* Direct Messages Section */}
        <section className={styles.messageSection}>
          <div className={styles.sectionHeader}>
            <h4>📨 Direct Messages</h4>
            <span className={styles.messageCount}>{directMessages.length}</span>
          </div>
          <p className={styles.sectionDescription}>
            Messages addressed to you, broadcast to all, or sent by you
          </p>
          <ol className={styles.sidebarMessageList}>
            {directMessages.length === 0 ? (
              <li className={styles.emptyState}>No direct messages yet</li>
            ) : (
              directMessages.map((message) => (
                <PhilosopherMessageCard
                  key={message.id}
                  message={message}
                  participants={participants}
                  showInsights={showInsights}
                  isOwnMessage={message.speaker === philosopherId}
                />
              ))
            )}
          </ol>
        </section>

        {/* General Chit-Chat Section */}
        <section className={styles.messageSection}>
          <div className={styles.sectionHeader}>
            <h4>💬 General Chit-Chat</h4>
            <span className={styles.messageCount}>{chitChatMessages.length}</span>
          </div>
          <p className={styles.sectionDescription}>
            Conversations between others that you can overhear
          </p>
          <ol className={styles.sidebarMessageList}>
            {chitChatMessages.length === 0 ? (
              <li className={styles.emptyState}>No general conversations yet</li>
            ) : (
              chitChatMessages.map((message) => (
                <PhilosopherMessageCard
                  key={message.id}
                  message={message}
                  participants={participants}
                  showInsights={false}
                  isOwnMessage={false}
                />
              ))
            )}
          </ol>
        </section>
      </div>
    </aside>
  );
};

interface PhilosopherMessageCardProps {
  message: MessageEvent;
  participants: Philosopher[];
  showInsights: boolean;
  isOwnMessage: boolean;
}

const PhilosopherMessageCard = ({
  message,
  participants,
  showInsights,
  isOwnMessage,
}: PhilosopherMessageCardProps) => {
  const speaker = participants.find((p) => p.id === message.speaker);
  const recipientLabels = message.recipients.map((recipient) => {
    if (recipient === 'moderator') return 'moderator';
    const match = participants.find((p) => p.id === recipient);
    return match?.name || recipient;
  });

  return (
    <li className={`${styles.sidebarMessage} ${isOwnMessage ? styles.ownMessage : ''}`}>
      <div className={styles.messageMeta}>
        <span className={styles.speakerName}>{speaker?.name || message.speaker}</span>
        <span className={styles.timestamp}>{formatTime(message.timestamp)}</span>
      </div>
      <div className={styles.messageRecipients}>→ {recipientLabels.join(', ')}</div>
      <p className={styles.messageText}>{message.surface}</p>
      {isOwnMessage && message.insight && (
        <details className={styles.sidebarInsight} open>
          <summary>🧠 My Reasoning</summary>
          <p>{message.insight}</p>
        </details>
      )}
      {showInsights && !isOwnMessage && message.insight && (
        <details className={styles.sidebarInsight}>
          <summary>Internal thoughts</summary>
          <p>{message.insight}</p>
        </details>
      )}
    </li>
  );
};
