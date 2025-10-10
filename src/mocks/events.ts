import { PhaseChangeEvent } from '../types';

const timestamp = (iso: string) => iso;

export const mockPhaseChanges: PhaseChangeEvent[] = [
  {
    id: 'phase-2',
    type: 'phase-change',
    phase: 'cross-response',
    timestamp: timestamp('2025-10-06T09:05:30Z'),
  },
  {
    id: 'phase-3',
    type: 'phase-change',
    phase: 'synthesis',
    timestamp: timestamp('2025-10-06T09:08:00Z'),
  },
];
