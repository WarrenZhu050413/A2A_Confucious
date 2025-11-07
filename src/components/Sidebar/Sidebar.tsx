import { useState } from 'react';
import type { Philosopher } from '../../types';
import { AddParticipantCard } from './AddParticipantCard';
import { PhilosopherEditor } from './PhilosopherEditor';
import styles from './Sidebar.module.css';

interface SidebarProps {
  philosophers: Philosopher[];
  activeIds: string[];
  onToggle: (id: string) => void;
  topic: string;
  onTopicChange: (topic: string) => void;
  showInsights: boolean;
  onToggleInsights: (value: boolean) => void;
  eventFeed: string[];
  queueDepths: Record<string, number>;
  queueOrder: string[];
  onAddPhilosopher: (philosopher: Philosopher) => void;
  onUpdatePhilosopher?: (philosopher: Philosopher) => void;
}

export const Sidebar = ({
  philosophers,
  activeIds,
  onToggle,
  topic,
  onTopicChange,
  showInsights,
  onToggleInsights,
  eventFeed,
  queueDepths,
  queueOrder,
  onAddPhilosopher,
  onUpdatePhilosopher,
}: SidebarProps) => {
  const [activeTab, setActiveTab] = useState<'roster' | 'controls' | 'events'>('roster');
  const [editingPhilosopher, setEditingPhilosopher] = useState<Philosopher | null>(null);
  const selected = philosophers.filter((philosopher) =>
    activeIds.includes(philosopher.id),
  );

  return (
    <aside className={styles.rosterColumn}>
      <div className={styles.tabBar}>
        <button
          className={activeTab === 'roster' ? styles.active : ''}
          onClick={() => setActiveTab('roster')}
          type="button"
        >
          Roster
        </button>
        <button
          className={activeTab === 'controls' ? styles.active : ''}
          onClick={() => setActiveTab('controls')}
          type="button"
        >
          Controls
        </button>
        <button
          className={activeTab === 'events' ? styles.active : ''}
          onClick={() => setActiveTab('events')}
          type="button"
        >
          Events
        </button>
      </div>

      <div className={styles.tabPanel}>
        {activeTab === 'roster' && (
          <>
            <div className={styles.toggleBar}>
              {philosophers.map((philosopher) => (
                <button
                  key={philosopher.id}
                  className={`${styles.pill} ${activeIds.includes(philosopher.id) ? styles.active : ''}`}
                  onClick={() => onToggle(philosopher.id)}
                  type="button"
                >
                  <span>{philosopher.name}</span>
                  {(queueDepths[philosopher.id] ?? 0) > 0 && (
                    <span className={styles.queueCount}>{queueDepths[philosopher.id]}</span>
                  )}
                </button>
              ))}
            </div>

            {selected.length === 0 && (
              <div className={styles.card}>
                <strong>No philosophers selected</strong>
                <span>Toggle a name above to add them back into the session.</span>
              </div>
            )}

            {selected.map((philosopher) => (
              <div key={philosopher.id} className={styles.card}>
                <header>
                  <span>{philosopher.name}</span>
                  <div className={styles.rosterMeta}>
                    <span className={styles.rosterPort}>
                      {philosopher.school} · port {philosopher.port}
                    </span>
                    <span
                      className={`${styles.queueChip} ${queueDepths[philosopher.id] ? styles.active : ''}`}
                    >
                      Queue {queueDepths[philosopher.id] ?? 0}
                    </span>
                  </div>
                </header>
                <p>{philosopher.personaSummary}</p>
                {onUpdatePhilosopher && (
                  <button
                    className={styles.editButton}
                    onClick={() => setEditingPhilosopher(philosopher)}
                    type="button"
                  >
                    ✏️ Edit Config
                  </button>
                )}
              </div>
            ))}

            {queueOrder.length > 0 && (
              <div className={styles.card}>
                <header>
                  <span>🎤 Speaking Order</span>
                </header>
                <div className={styles.queueOrderList}>
                  {queueOrder.map((philosopherId, index) => {
                    const philosopher = philosophers.find((p) => p.id === philosopherId);
                    if (!philosopher) return null;
                    return (
                      <div key={philosopherId} className={styles.queueOrderItem}>
                        <span className={styles.queuePosition}>{index + 1}</span>
                        <span className={styles.queuePhilosopherName}>{philosopher.name}</span>
                        {(queueDepths[philosopherId] ?? 0) > 0 && (
                          <span className={styles.queueMessageCount}>
                            {queueDepths[philosopherId]} msg{(queueDepths[philosopherId] ?? 0) > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'controls' && (
          <>
            <div className={styles.card}>
              <strong>Dialogue Topic</strong>
              <input
                type="text"
                value={topic}
                onChange={(e) => onTopicChange(e.target.value)}
                placeholder="Enter dialogue topic..."
                className={styles.topicInput}
              />
              <p>Define the central question or theme for this philosophical dialogue.</p>
            </div>

            <div className={styles.card}>
              <strong>Insights Visibility</strong>
              <div className={styles.toggleBar}>
                <button
                  className={`${styles.pill} ${showInsights ? styles.active : ''}`}
                  onClick={() => onToggleInsights(true)}
                  type="button"
                >
                  Show reasoning
                </button>
                <button
                  className={`${styles.pill} ${!showInsights ? styles.active : ''}`}
                  onClick={() => onToggleInsights(false)}
                  type="button"
                >
                  Hide reasoning
                </button>
              </div>
              <p>
                Toggle whether internal reasoning appears alongside each reply in the
                transcript.
              </p>
            </div>

            <AddParticipantCard
              onAdd={onAddPhilosopher}
              existingIds={new Set(philosophers.map((philosopher) => philosopher.id))}
            />
          </>
        )}

        {activeTab === 'events' && (
          <div className={styles.card}>
            <strong>Event Feed</strong>
            <div className={styles.eventFeed}>
              {eventFeed.length === 0 && <span>Stream initializing…</span>}
              {eventFeed.map((entry, index) => (
                <span key={`${entry}-${index}`}>{entry}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {editingPhilosopher && onUpdatePhilosopher && (
        <PhilosopherEditor
          philosopher={editingPhilosopher}
          onSave={(updated) => {
            onUpdatePhilosopher(updated);
            setEditingPhilosopher(null);
          }}
          onCancel={() => setEditingPhilosopher(null)}
        />
      )}
    </aside>
  );
};
