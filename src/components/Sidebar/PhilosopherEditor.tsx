import { useState } from 'react';
import type { Philosopher } from '../../types';
import styles from './PhilosopherEditor.module.css';

interface PhilosopherEditorProps {
  philosopher: Philosopher;
  onSave: (philosopher: Philosopher) => void;
  onCancel: () => void;
}

export const PhilosopherEditor = ({
  philosopher,
  onSave,
  onCancel,
}: PhilosopherEditorProps) => {
  const [editedPhilosopher, setEditedPhilosopher] = useState<Philosopher>(philosopher);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(editedPhilosopher);
  };

  return (
    <div className={styles.editorOverlay}>
      <div className={styles.editorModal}>
        <div className={styles.editorHeader}>
          <h3>Edit Philosopher Configuration</h3>
          <button
            className={styles.closeButton}
            onClick={onCancel}
            type="button"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.editorForm}>
          <div className={styles.formGroup}>
            <label htmlFor="name">Name</label>
            <input
              id="name"
              type="text"
              value={editedPhilosopher.name}
              onChange={(e) =>
                setEditedPhilosopher({ ...editedPhilosopher, name: e.target.value })
              }
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="school">School</label>
            <input
              id="school"
              type="text"
              value={editedPhilosopher.school}
              onChange={(e) =>
                setEditedPhilosopher({ ...editedPhilosopher, school: e.target.value })
              }
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="port">Port</label>
            <input
              id="port"
              type="number"
              value={editedPhilosopher.port}
              onChange={(e) =>
                setEditedPhilosopher({
                  ...editedPhilosopher,
                  port: parseInt(e.target.value, 10),
                })
              }
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="personaSummary">Persona Summary</label>
            <textarea
              id="personaSummary"
              value={editedPhilosopher.personaSummary}
              onChange={(e) =>
                setEditedPhilosopher({ ...editedPhilosopher, personaSummary: e.target.value })
              }
              rows={3}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="personaTemplate">Persona Template</label>
            <textarea
              id="personaTemplate"
              value={editedPhilosopher.personaTemplate}
              onChange={(e) =>
                setEditedPhilosopher({ ...editedPhilosopher, personaTemplate: e.target.value })
              }
              rows={10}
              required
            />
            <span className={styles.helpText}>
              This template defines how the philosopher responds. Use clear, descriptive language.
            </span>
          </div>

          <div className={styles.formActions}>
            <button type="button" onClick={onCancel} className={styles.cancelButton}>
              Cancel
            </button>
            <button type="submit" className={styles.saveButton}>
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
