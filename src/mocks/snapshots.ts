import { SnapshotEvent } from '../types';
import { promptTemplateSkeleton, defaultUserPrompt } from '../config/prompts';

const timestamp = (iso: string) => iso;

export const mockSnapshots: SnapshotEvent[] = [
  {
    id: 'ctx-1',
    type: 'context-snapshot',
    phase: 'introduce',
    timestamp: timestamp('2025-10-06T08:59:50Z'),
    contextId: 'dialogue-water-duty',
    round: 1,
    audience: 'confucius',
    userPrompt: defaultUserPrompt,
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
    <UserPrompt><![CDATA[${defaultUserPrompt}]]></UserPrompt>
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
