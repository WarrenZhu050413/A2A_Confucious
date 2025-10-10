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

export const defaultUserPrompt =
  'Coordinate the Yellow River flood response by addressing one or more council peers in each turn so every recipient knows the message is aimed at them, balancing ritual alignment with logistics.';
