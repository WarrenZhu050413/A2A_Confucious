import { useState, type ChangeEvent } from 'react';
import type { Philosopher } from '../../types';
import styles from './AddParticipantCard.module.css';

interface AddParticipantCardProps {
  onAdd: (philosopher: Philosopher) => void;
  existingIds: Set<string>;
}

export const AddParticipantCard = ({ onAdd, existingIds }: AddParticipantCardProps) => {
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

  const handleChange =
    (field: keyof typeof form) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: event.target.value }));
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
    setForm({
      name: '',
      id: '',
      school: '',
      port: '',
      personaSummary: '',
      personaTemplate: '',
    });
    setError(null);
  };

  return (
    <div className={styles.addPhilosopherCard}>
      <strong>Add participant</strong>
      <p>Register a new persona to bring additional voices into the conversation.</p>
      {error && <span className={styles.formError}>{error}</span>}
      <div className={styles.addForm}>
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
          <input
            value={form.school}
            onChange={handleChange('school')}
            placeholder="儒家"
          />
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
      <button className={styles.primaryButton} onClick={handleSubmit} type="button">
        Add participant
      </button>
    </div>
  );
};
