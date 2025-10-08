import { Philosopher } from '../types';
import { MemoryEntry, MemoryState, getHistoryFor, getLatestFor } from './memory';

const formatEntry = (entry: MemoryEntry) =>
  `[${entry.timestamp}] ${entry.speaker} → ${entry.recipients.join(', ') || 'all'} :: ${entry.message}`;

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
): AssembledContext => {
  const history = getHistoryFor(memoryState, philosopher.id);
  const trimmedHistory = history.slice(-memoryState.max);
  const renderedHistory = trimmedHistory.map(formatEntry).join('\n');

  const latestFromMemory = getLatestFor(memoryState, philosopher.id);
  const latestLine = latestFromMemory ? formatEntry(latestFromMemory) : 'None';

  const recipientsCSV = newPrompt.recipients.join(', ');

  const promptText = `<Prompt>\n  <SystemPersona philosopher="${philosopher.id}" version="2025-10-06">\n    <![CDATA[\n    ${philosopher.personaTemplate}\n    ]]>\n  </SystemPersona>\n\n  <ConversationMemory max="${memoryState.max}">\n    <![CDATA[\n    ${renderedHistory}\n    ]]>\n  </ConversationMemory>\n\n  <LatestExchange>\n    <![CDATA[\n    ${latestLine}\n    ]]>\n  </LatestExchange>\n\n  <Directive>\n    <![CDATA[\n    Addressed: ${recipientsCSV || 'all'}\n    Prompt: ${newPrompt.text}\n    ]]>\n  </Directive>\n\n  <OutputContract>\n    <![CDATA[\n    Return a strict JSON object with keys "reasoning" and "final".\n    - reasoning: concise internal analysis for the moderator; do not address recipients here.\n    - final: polished prose delivered to recipients; explicitly acknowledge the moderator and every listed recipient.\n    ]]>\n  </OutputContract>\n</Prompt>`;

  return {
    promptText,
    renderedHistory,
    latestLine,
    historyEntries: trimmedHistory,
  };
};
