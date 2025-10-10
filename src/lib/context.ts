import { Philosopher } from '../types';
import { MemoryEntry, MemoryState, getHistoryFor, getLatestFor } from './memory';

const formatEntry = (entry: MemoryEntry) =>
  `{"sender": "${entry.speaker}", "receivers": [${entry.recipients.map(r => `"${r}"`).join(', ')}], "message": "${entry.message.replace(/"/g, '\\"')}"}`;

export type AssembledContext = {
  promptText: string;
  renderedHistory: string;
  latestLine: string;
  historyEntries: MemoryEntry[];
};

export const assembleContextForPhilosopher = (
  philosopher: Philosopher,
  memoryState: MemoryState,
  newPrompt: { recipients: string[]; text: string; timestamp: string; speaker: string },
  topic?: string,
): AssembledContext => {
  const history = getHistoryFor(memoryState, philosopher.id);
  const trimmedHistory = history.slice(-memoryState.max);

  // Separate direct messages from ambient context
  const directMessages: MemoryEntry[] = [];
  const ambientMessages: MemoryEntry[] = [];

  trimmedHistory.forEach(entry => {
    const isDirectlyAddressed =
      entry.recipients.includes(philosopher.id) ||
      entry.recipients.includes('all') ||
      entry.speaker === philosopher.id;

    if (isDirectlyAddressed) {
      directMessages.push(entry);
    } else {
      ambientMessages.push(entry);
    }
  });

  // Render messages in their respective sections
  const directMessagesText = directMessages.length > 0
    ? directMessages.map(formatEntry).join('\n')
    : 'None';

  const ambientMessagesText = ambientMessages.length > 0
    ? ambientMessages.map(formatEntry).join('\n')
    : 'None';

  // Backward compatibility: keep full history for renderedHistory field
  const renderedHistory = trimmedHistory.map(formatEntry).join('\n');

  const latestFromMemory = getLatestFor(memoryState, philosopher.id);
  const latestLine = latestFromMemory ? formatEntry(latestFromMemory) : 'None';

  const recipientsCSV = newPrompt.recipients.join(', ');

  const topicSection = topic ? `\n  <Topic>\n    <![CDATA[\n    The topic to be discussed today is: ${topic}\n    ]]>\n  </Topic>\n` : '';

  const promptText = `<Prompt>\n  <SystemPersona philosopher="${philosopher.id}" version="2025-10-06">\n    <![CDATA[\n    ${philosopher.personaTemplate}\n    ]]>\n  </SystemPersona>${topicSection}\n  <DirectMessages priority="high" max="${memoryState.max}">\n    <![CDATA[\n    ${directMessagesText}\n    ]]>\n  </DirectMessages>\n\n  <AmbientContext priority="low">\n    <![CDATA[\n    ${ambientMessagesText}\n    ]]>\n  </AmbientContext>\n\n  <LatestExchange>\n    <![CDATA[\n    ${latestLine}\n    ]]>\n  </LatestExchange>\n\n  <Directive>\n    <![CDATA[\n    Addressed: ${recipientsCSV || 'all'}\n    Prompt: ${newPrompt.text}\n    ]]>\n  </Directive>\n\n  <OutputContract>\n    <![CDATA[\n    Return a strict JSON object with keys "reasoning", "final", and "addressees".\n    - reasoning: concise internal analysis for the moderator; do not address recipients here.\n    - final: polished prose delivered to recipients; explicitly acknowledge the moderator and every listed recipient.\n    - addressees: optional array of philosopher IDs you wish to address with this response (e.g., ["laozi", "mozi"]).\n      The order matters: the first addressee will respond first, second responds second, etc.\n      If you want to address someone specifically, include their ID here. Otherwise, omit this field.\n    ]]>\n  </OutputContract>\n</Prompt>`;

  return {
    promptText,
    renderedHistory,
    latestLine,
    historyEntries: trimmedHistory,
  };
};
