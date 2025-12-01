/**
 * Shared helpers for building prompts and validating message payloads.
 */

/**
 * @typedef {{ role: 'user'|'assistant'|'system', content: string | Array<unknown> }} ChatMessage
 */

function invalidRequest(message) {
  const error = new Error(message);
  error.code = 'INVALID_REQUEST';
  return error;
}

/**
 * Validate that the provided messages array is usable.
 * @param {unknown} messages
 * @returns {asserts messages is ChatMessage[]}
 */
export function assertValidMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw invalidRequest('Invalid request: messages array is required');
  }

  for (const [index, message] of messages.entries()) {
    if (!message || typeof message !== 'object') {
      throw invalidRequest(`Invalid message at index ${index}: must be an object`);
    }

    if (!message.role || typeof message.role !== 'string') {
      throw invalidRequest(`Invalid message at index ${index}: missing role`);
    }

    if (typeof message.content !== 'string' && !Array.isArray(message.content)) {
      throw invalidRequest(`Invalid message at index ${index}: content must be string or array`);
    }
  }
}

/**
 * Detect whether any message contains non-text content (array-based multimodal payloads).
 * @param {ChatMessage[]} messages
 */
export function hasMultimodalContent(messages) {
  return messages.some(message => Array.isArray(message.content));
}

/**
 * Convert a list of messages and an optional system prompt into a single prompt string.
 * @param {ChatMessage[]} messages
 * @param {string | undefined} systemPrompt
 */
export function buildPrompt(messages, systemPrompt) {
  const conversationText = messages
    .map(message => {
      const roleLabel = message.role === 'assistant' ? 'Assistant' : 'User';
      return `${roleLabel}: ${message.content}`;
    })
    .join('\n\n');

  return systemPrompt ? `${systemPrompt}\n\n${conversationText}` : conversationText;
}

/**
 * Extract raw text from an agent SDK message payload (array of content blocks).
 * @param {Array<{ type: string, text?: string }>} content
 */
export function extractTextBlocks(content = []) {
  return content
    .filter(block => block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('');
}
