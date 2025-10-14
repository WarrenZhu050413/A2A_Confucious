import type { MessageEvent, Philosopher } from '../../types';
import { formatTime } from '../../lib/time';
import styles from './MessageCard.module.css';

interface MessageCardProps {
  message: MessageEvent;
  showInsights: boolean;
  participants: Philosopher[];
  highlightReasoning?: boolean;
}

export const MessageCard = ({
  message,
  showInsights,
  participants,
  highlightReasoning = false,
}: MessageCardProps) => {
  const speaker = participants.find((philosopher) => philosopher.id === message.speaker);
  const recipientLabels = message.recipients.map((recipient) => {
    if (recipient === 'moderator') {
      return 'moderator';
    }
    const match = participants.find((philosopher) => philosopher.id === recipient);
    return match?.name || recipient;
  });

  return (
    <li className={`${styles.message} ${highlightReasoning ? styles.ownMessage : ''}`}>
      <div className={styles.meta}>
        <span>
          {speaker?.name || message.speaker} · {formatTime(message.timestamp)} · →{' '}
          {recipientLabels.join(', ')}
        </span>
      </div>
      <p>{message.surface}</p>
      {message.quote && (
        <details className={styles.quoteBlock} open>
          <summary>📜 Classical Quote</summary>
          <div className={styles.chineseQuote}>{message.quote.chinese}</div>
          <div className={styles.englishTranslation}>{message.quote.english}</div>
          <cite className={styles.quoteSource}>— {message.quote.source}</cite>
        </details>
      )}
      {highlightReasoning && message.insight && (
        <details className={`${styles.insight} ${styles.reasoningHighlight}`} open>
          <summary>🧠 My Internal Reasoning</summary>
          <p>{message.insight}</p>
        </details>
      )}
      {showInsights && !highlightReasoning && message.insight && (
        <details className={styles.insight} open>
          <summary>Internal thoughts</summary>
          <p>{message.insight}</p>
        </details>
      )}
    </li>
  );
};
