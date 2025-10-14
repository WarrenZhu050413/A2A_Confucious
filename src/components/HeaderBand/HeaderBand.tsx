import styles from './HeaderBand.module.css';

interface HeaderBandProps {
  inspectorOpen: boolean;
  onToggleInspector: () => void;
  backendHealthy: boolean | null;
  isPaused: boolean;
  onTogglePause: () => void;
}

export const HeaderBand = ({
  inspectorOpen,
  onToggleInspector,
  backendHealthy,
  isPaused,
  onTogglePause,
}: HeaderBandProps) => {
  const backendStatusClass =
    backendHealthy === null ? 'pending' : backendHealthy ? 'online' : 'offline';
  return (
    <header className={styles.headerBand}>
      <div>
        <h1>Confucian Café · Dialogue Orchestrator</h1>
        <p className={styles.headerSubline}>
          Sequential philosophical dialogue with web-enhanced responses
        </p>
      </div>
      <div className={styles.toggleBar}>
        <button className={styles.inspectorToggle} onClick={onToggleInspector}>
          {inspectorOpen ? 'Hide Inspector' : 'Show Inspector'}
        </button>
        <button className={styles.pauseToggle} onClick={onTogglePause} type="button">
          {isPaused ? 'Resume auto-responses' : 'Pause auto-responses'}
        </button>
        <span className={`${styles.statusChip} ${isPaused ? styles.paused : styles.active}`}>
          {isPaused ? 'Paused' : 'Live'}
        </span>
        <span className={`${styles.backendDot} ${styles[backendStatusClass]}`} />
      </div>
    </header>
  );
};
