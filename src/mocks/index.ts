import { ConversationEvent } from '../types';
import { mockMessages } from './messages';
import { mockPhaseChanges } from './events';
import { mockSnapshots } from './snapshots';

export { mockMessages } from './messages';
export { mockPhaseChanges } from './events';
export { mockSnapshots } from './snapshots';

export const mockEventSequence: ConversationEvent[] = [
  ...mockSnapshots,
  ...mockMessages,
  ...mockPhaseChanges,
].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
