import { useState, useEffect } from 'react';
import type { Philosopher, ComposerSubmission } from '../../types';
import styles from './PromptComposer.module.css';

interface PromptComposerProps {
  onSubmit: (submission: ComposerSubmission) => void;
  roster: Philosopher[];
}

export const PromptComposer = ({ onSubmit, roster }: PromptComposerProps) => {
  const [prompt, setPrompt] = useState('');
  const [recipients, setRecipients] = useState<string[]>(['confucius', 'laozi', 'mozi']);

  useEffect(() => {
    setRecipients((prev) => {
      const valid = prev.filter((id) =>
        roster.some((philosopher) => philosopher.id === id),
      );
      const missing = roster
        .map((philosopher) => philosopher.id)
        .filter((id) => !valid.includes(id));
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
    setRecipients((prev) =>
      prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id],
    );
  };

  const selectAll = () => {
    const allIds = roster.map((philosopher) => philosopher.id);
    setRecipients(allIds);
  };

  const handleSubmit = () => {
    onSubmit({ prompt, recipients });
    setPrompt('');
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!disableSubmit) {
        handleSubmit();
      }
    }
  };

  const disableSubmit = prompt.trim().length === 0 || recipients.length === 0;

  return (
    <div className={styles.promptComposer}>
      <label>
        <strong>User Prompt Composer</strong>
        <span className={styles.keyboardHint}>Enter to send · Shift+Enter for new line</span>
      </label>
      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Address one or more philosophers by name, pose a question, or request synthesis…"
      />
      <div className={styles.actions}>
        <div className={styles.toggleBar}>
          <button className={styles.pill} onClick={selectAll} type="button">
            Address entire council
          </button>
          {roster.map((philosopher) => (
            <button
              key={philosopher.id}
              className={`${styles.pill} ${recipients.includes(philosopher.id) ? styles.active : ''}`}
              onClick={() => toggleRecipient(philosopher.id)}
              type="button"
            >
              {philosopher.name}
            </button>
          ))}
        </div>
        <button
          className={styles.primaryButton}
          onClick={handleSubmit}
          disabled={disableSubmit}
          type="button"
        >
          Send Prompt
        </button>
      </div>
    </div>
  );
};
