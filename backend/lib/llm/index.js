import { assertValidMessages, hasMultimodalContent, buildPrompt } from './promptUtils.js';
import { claudeProvider } from './providers/claudeProvider.js';
import { codexProvider } from './providers/codexProvider.js';

const DEFAULT_PROVIDERS = {
  codex: codexProvider,
  claude: claudeProvider,
};

const DEFAULT_MODELS = {
  codex: process.env.CODEX_MODEL || 'gpt5-codex',
  claude: process.env.CLAUDE_MODEL || 'sonnet',
};

const CODEX_MODEL_PATTERN = /(codex|gpt)/i;

function normalizeClaudeModelName(model, defaultModel) {
  if (!model || typeof model !== 'string') {
    return defaultModel;
  }

  const normalized = model.toLowerCase();

  if (normalized.includes('sonnet')) {
    return 'sonnet';
  }

  if (normalized.includes('haiku')) {
    return 'haiku';
  }

  if (normalized.includes('opus')) {
    return 'opus';
  }

  return defaultModel;
}

function resolveProviderKey(providers) {
  const envProvider = process.env.LLM_PROVIDER?.toLowerCase();
  if (envProvider && providers[envProvider]) {
    return envProvider;
  }

  const useClaude = process.env.USE_CLAUDE === '1' || process.env.USE_CLAUDE === 'true';
  if (useClaude) {
    return 'claude';
  }

  return 'codex';
}

export function createLLMService({ providers = DEFAULT_PROVIDERS, websearchEnabled = false } = {}) {
  const providerKey = resolveProviderKey(providers);
  const provider = providers[providerKey];

  if (!provider) {
    throw new Error(`Unsupported LLM provider: ${providerKey}`);
  }

  const validate = messages => {
    assertValidMessages(messages);
    if (hasMultimodalContent(messages)) {
      const error = new Error('Multimodal messages not supported by current provider');
      error.code = 'UNSUPPORTED_MULTIMODAL';
      throw error;
    }
  };

  const normalizeOptionsForProvider = options => {
    const defaultModel = DEFAULT_MODELS[providerKey];

    if (providerKey === 'codex') {
      const {
        model,
        providerOptions = {},
        ...rest
      } = options ?? {};

      const userRequestedModel = model || providerOptions.model;
      const normalizedProviderOptions = { ...providerOptions };

      if (userRequestedModel) {
        normalizedProviderOptions.model = userRequestedModel;
      } else {
        delete normalizedProviderOptions.model;
      }

      // Add websearch flag if enabled (add to a separate property to avoid buildArgs)
      if (websearchEnabled) {
        normalizedProviderOptions.websearchEnabled = true;
      }

      if (!Object.keys(normalizedProviderOptions).length) {
        delete normalizedProviderOptions.model;
      }

      const normalizedOptions = {
        ...rest,
        ...(Object.keys(normalizedProviderOptions).length
          ? { providerOptions: normalizedProviderOptions }
          : {}),
      };

      return {
        normalized: normalizedOptions,
        requestedModel: userRequestedModel,
        resolvedModel: userRequestedModel || defaultModel,
      };
    }

    if (providerKey === 'claude') {
      const { model, ...rest } = options ?? {};
      const requestedModel = model || defaultModel;
      const resolvedModel = normalizeClaudeModelName(requestedModel, defaultModel);
      const normalizedOptions = {
        ...rest,
        model: resolvedModel,
      };

      // Add web_search tool if enabled
      if (websearchEnabled) {
        const allowedTools = normalizedOptions.allowedTools || [];
        if (!allowedTools.includes('web_search')) {
          normalizedOptions.allowedTools = [...allowedTools, 'web_search'];
        }
      }

      return {
        normalized: normalizedOptions,
        requestedModel,
        resolvedModel,
      };
    }

    return { normalized: options, requestedModel: undefined, resolvedModel: undefined };
  };

  const prepare = (messages, options = {}) => {
    const { system, ...otherOptions } = options;
    const { normalized, requestedModel, resolvedModel } = normalizeOptionsForProvider(otherOptions);
    const prompt = buildPrompt(messages, system);
    return { prompt, providerOptions: normalized ?? {}, requestedModel, resolvedModel };
  };

  const wrapMetadata = metadata => ({
    ...metadata,
    provider: provider.name,
    providerKey,
    source: provider.name,
    timestamp: metadata?.timestamp ?? Date.now(),
  });

  return {
    providerName: provider.name,

    async sendMessage({ messages, options }) {
      validate(messages);
      const { prompt, providerOptions, requestedModel, resolvedModel } = prepare(messages, options);
      const response = await provider.send({
        prompt,
        options: {
          ...providerOptions,
          requestedModel,
          resolvedModel,
        }
      });
      return {
        content: response.content,
        metadata: wrapMetadata({
          ...(response.metadata || {}),
          requestedModel,
          resolvedModel,
        }),
      };
    },

    async streamMessage({ messages, options, onToken, onDone, onError }) {
      validate(messages);
      const { prompt, providerOptions, requestedModel, resolvedModel } = prepare(messages, options);
      return provider.stream({
        prompt,
        options: {
          ...providerOptions,
          requestedModel,
          resolvedModel,
        },
        onToken,
        onDone: metadata => {
          if (typeof onDone === 'function') {
            onDone({
              ...(metadata || {}),
              requestedModel,
              resolvedModel,
            });
          }
        },
        onError,
      });
    },

    getProviderKey() {
      return providerKey;
    },

    getProviderName() {
      return provider.name;
    }
  };
}
