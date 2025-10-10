import { MessageEvent } from '../types';

const timestamp = (iso: string) => iso;

export const mockMessages: MessageEvent[] = [
  {
    id: 'evt-1',
    type: 'message',
    speaker: 'confucius',
    recipients: ['laozi', 'mozi'],
    phase: 'introduce',
    timestamp: timestamp('2025-10-06T09:00:00Z'),
    surface:
      'A stable river requires ritual order: align community duties so each hamlet knows its flood watch.',
    insight: 'Link li 礼 to practical duty; expect Mozi to push utility.',
    translations: {
      english:
        'A stable river requires ritual order: align community duties so each hamlet knows its flood watch.',
    },
  },
  {
    id: 'evt-2',
    type: 'message',
    speaker: 'laozi',
    recipients: ['confucius', 'mozi'],
    phase: 'introduce',
    timestamp: timestamp('2025-10-06T09:02:00Z'),
    surface:
      'Let the water wander within soft banks; govern like tending bamboo—guide growth, do not hammer it straight.',
    translations: {
      english:
        'Let the water wander within soft banks; govern like tending bamboo—guide growth, do not hammer it straight.',
    },
  },
  {
    id: 'evt-3',
    type: 'message',
    speaker: 'mozi',
    recipients: ['confucius', 'laozi'],
    phase: 'introduce',
    timestamp: timestamp('2025-10-06T09:04:00Z'),
    surface:
      'Count the benefit: evacuate first, reinforce levees second, record lessons for every province.',
    translations: {
      english:
        'Count the benefit: evacuate first, reinforce levees second, record lessons for every province.',
    },
  },
  {
    id: 'evt-5',
    type: 'message',
    speaker: 'mozi',
    recipients: ['confucius'],
    phase: 'cross-response',
    timestamp: timestamp('2025-10-06T09:06:10Z'),
    surface: 'Ritual can wait; measure the flow and deploy crews before ceremony.',
    translations: {
      english: 'Ritual can wait; measure the flow and deploy crews before ceremony.',
    },
  },
  {
    id: 'evt-7',
    type: 'message',
    speaker: 'confucius',
    recipients: ['mozi', 'laozi'],
    phase: 'synthesis',
    timestamp: timestamp('2025-10-06T09:08:40Z'),
    surface: 'Let us set rites that encode Mozi\'s schedule: the ritual becomes the checklist for readiness.',
    translations: {
      english:
        'Let us set rites that encode Mozi\'s schedule: the ritual becomes the checklist for readiness.',
    },
  },
];
