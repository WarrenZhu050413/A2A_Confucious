export type Phase = 'introduce' | 'cross-response' | 'synthesis';

export type Philosopher = {
  id: string;
  name: string;
  school: string;
  port: number;
  personaSummary: string;
  personaTemplate: string;
};

export type TranslationLanguage = 'english' | 'modern' | 'classical';

export type TranslationMap = Partial<Record<TranslationLanguage, string>> & {
  english: string;
};

export type MessageEvent = {
  id: string;
  type: 'message';
  speaker: string;
  recipients: string[];
  phase: Phase;
  timestamp: string;
  surface: string;
  insight?: string;
  translations: TranslationMap;
};

export type TranslationEvent = {
  id: string;
  type: 'translation';
  parentId: string;
  language: Exclude<TranslationLanguage, 'english'>;
  text: string;
};

export type PhaseChangeEvent = {
  id: string;
  type: 'phase-change';
  phase: Phase;
  timestamp: string;
};

export type SnapshotEvent = {
  id: string;
  type: 'context-snapshot';
  phase: Phase;
  timestamp: string;
  contextId: string;
  round: number;
  audience: string;
  userPrompt: string;
  prompt: {
    templateId: string;
    templateSkeleton: string;
    rendered: string;
  };
  contextMessages: Array<Pick<MessageEvent, 'id' | 'speaker' | 'phase' | 'surface' | 'timestamp'>>;
};

export type ConversationEvent =
  | MessageEvent
  | TranslationEvent
  | PhaseChangeEvent
  | SnapshotEvent;

export type SnapshotCallPayload = {
  recipient: string;
  history: string;
  historyEntries: Array<Pick<MessageEvent, 'id' | 'speaker' | 'phase' | 'surface' | 'timestamp'>>;
  latest: string;
  triggerId: string;
  final: string;
  reasoning?: string;
};

export type LanguageDefaults = {
  english: boolean;
  modern: boolean;
  classical: boolean;
};

export type ComposerSubmission = {
  prompt: string;
  recipients: string[];
};

export type InspectorSnapshot = SnapshotEvent & {
  callPayload?: SnapshotCallPayload;
};
