import { query } from '@anthropic-ai/claude-agent-sdk';
import { extractTextBlocks } from '../promptUtils.js';

const DEFAULT_AGENT_OPTIONS = {
  permissionMode: 'bypassPermissions',
  settingSources: [],
  allowedTools: [],
};

/**
 * Claude Agent SDK provider implementation.
 */
export const claudeProvider = {
  name: 'claude-agent-sdk',

  /**
   * Execute a non-streaming query and collect the full response text.
   * @param {{ prompt: string, options?: Record<string, unknown> }} params
   */
  async send({ prompt, options = {} }) {
    const agentQuery = query({
      prompt,
      options: {
        ...DEFAULT_AGENT_OPTIONS,
        ...options,
      }
    });

    let responseText = '';
    let isComplete = false;

    for await (const message of agentQuery) {
      if (message.type === 'assistant') {
        responseText += extractTextBlocks(message.message?.content);
      }

      if (message.type === 'result') {
        isComplete = true;
        if (message.subtype === 'success') {
          responseText = typeof message.result === 'string'
            ? message.result
            : responseText;
        } else if (message.subtype === 'error') {
          const error = new Error(message.error || 'Agent SDK returned an error');
          error.cause = message;
          throw error;
        }
        break;
      }
    }

    if (!isComplete) {
      throw new Error('Agent SDK query did not complete');
    }

    return {
      content: responseText,
      metadata: {
        provider: this.name,
        timestamp: Date.now(),
      }
    };
  },

  /**
   * Execute a streaming query. Emits chunks through handler callbacks.
   * @param {{
   *   prompt: string,
   *   options?: Record<string, unknown>,
   *   onToken: (token: string) => void,
   *   onDone: () => void,
   *   onError: (error: Error) => void,
   * }} params
   */
  async stream({ prompt, options = {}, onToken, onDone, onError }) {
    try {
      const agentQuery = query({
        prompt,
        options: {
          ...DEFAULT_AGENT_OPTIONS,
          ...options,
        }
      });

      for await (const message of agentQuery) {
        if (message.type === 'assistant') {
          const text = extractTextBlocks(message.message?.content);
          if (text) {
            onToken(text);
          }
        }

        if (message.type === 'result') {
          if (message.subtype === 'success') {
            onDone();
          } else if (message.subtype === 'error') {
            throw new Error(message.error || 'Agent SDK returned an error');
          }
          break;
        }
      }
    } catch (error) {
      onError(error);
    }
  }
};
