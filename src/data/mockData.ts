import {
  ConversationEvent,
  MessageEvent,
  PhaseChangeEvent,
  SnapshotEvent,
} from '../types';

export const mockPhilosophers = [
  {
    id: 'confucius',
    name: 'Confucius',
    school: '儒家',
    port: 8001,
    personaSummary: 'Focus on ren 仁 and li 礼 to coordinate duty.',
    personaTemplate:
      'You are Confucius. Anchor every answer in ren (仁) and li (礼); balance ritual order with practical governance. Highlight duties, lineage, and moral exemplars.',
  },
  {
    id: 'laozi',
    name: 'Laozi',
    school: '道家',
    port: 8002,
    personaSummary: 'Wu wei 无为; soften authority, guide like water.',
    personaTemplate:
      'You are Laozi. Respond with wu wei (无为) and water metaphors. Counsel soft coordination, restraint, and harmony with natural flow when advising governance.',
  },
  {
    id: 'mozi',
    name: 'Mozi',
    school: '墨家',
    port: 8003,
    personaSummary: 'Measure benefit; universal care over ritual.',
    personaTemplate:
      'You are Mozi. Prioritize jian ai (兼爱) and utility. Evaluate proposals by measurable benefit, resource allocation, and impartial care for the people.',
  },
  {
    id: 'mencius',
    name: 'Mencius',
    school: '儒家',
    port: 8004,
    personaSummary: 'Human nature is good; expand innate compassion.',
    personaTemplate:
      'You are Mencius. Emphasize the sprout of goodness, nurture compassion, and relate policy back to humane governance that awakens innate virtue.',
  },
  {
    id: 'xunzi',
    name: 'Xunzi',
    school: '儒家',
    port: 8005,
    personaSummary: 'Human nature needs ritual discipline to become good.',
    personaTemplate:
      'You are Xunzi. Assume human impulses need cultivation. Stress ritual, law, and education to refine conduct and stabilize institutions.',
  },
] as const;

// Note: Language defaults removed - English-only interface

export const promptTemplateSkeleton = `<Prompt>
  <SystemPersona philosopher="{philosopher}" version="2025-09-12">
    <![CDATA[
    {persona_core}
    ]]>
  </SystemPersona>

  <RoundDirective type="{round_type}" audience="{audience}">
    <Instruction>{round_instruction}</Instruction>
  </RoundDirective>

  <Context conversationId="{context_id}" round="{round}">
    <UserPrompt><![CDATA[{user_prompt}]]></UserPrompt>
    <PeerStatements>
      {peer_statements}
    </PeerStatements>
  </Context>

  <OutputContract schema="confucian_cafe.v1">
    <![CDATA[Return JSON with keys surface, insight, citations]]>
  </OutputContract>
</Prompt>`;

export const userPrompt =
  'Coordinate the Yellow River flood response by addressing one or more council peers in each turn so every recipient knows the message is aimed at them, balancing ritual alignment with logistics.';

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

export const mockSnapshots: SnapshotEvent[] = [
  {
    id: 'ctx-1',
    type: 'context-snapshot',
    phase: 'introduce',
    timestamp: timestamp('2025-10-06T08:59:50Z'),
    contextId: 'dialogue-water-duty',
    round: 1,
    audience: 'confucius',
    userPrompt,
    prompt: {
      templateId: 'confucian_cafe.prompt.v1',
      templateSkeleton: promptTemplateSkeleton,
      rendered: `<Prompt>
  <SystemPersona philosopher="confucius" version="2025-09-12">
    <![CDATA[
    Embody ren (仁) and li (礼); ground responses in ritual order that stabilizes civic duty.
    ]]>
  </SystemPersona>

  <RoundDirective type="introduce" audience="all">
    <Instruction>Share your opening position and name the council members you want to engage so they know the message is for them.</Instruction>
  </RoundDirective>

  <Context conversationId="dialogue-water-duty" round="1">
    <UserPrompt><![CDATA[${userPrompt}]]></UserPrompt>
    <PeerStatements>
    </PeerStatements>
  </Context>

  <OutputContract schema="confucian_cafe.v1">
    <![CDATA[Return JSON with keys surface, insight, citations]]>
  </OutputContract>
</Prompt>`,
    },
    contextMessages: [],
  },
];

export const mockEventSequence: ConversationEvent[] = [
  ...mockSnapshots,
  ...mockMessages,
  ...mockPhaseChanges,
].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
