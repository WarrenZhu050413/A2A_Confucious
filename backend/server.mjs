#!/usr/bin/env node

/**
 * Nabokov Backend Server
 *
 * Local Node.js server that proxies requests from the Chrome extension to an
 * LLM provider. Supports both the Claude Agent SDK and the Codex CLI, with a
 * shared interface to keep routing logic identical across providers.
 */

import express from 'express';
import cors from 'cors';
import { randomBytes } from 'node:crypto';
import { createColors } from 'colorette';
import { createLLMService } from './lib/llm/index.js';

const argv = process.argv.slice(2);
const DEBUG_MODE = argv.includes('--debug') || argv.includes('-d') || process.env.NABOKOV_BACKEND_DEBUG === '1' || process.env.NABOKOV_BACKEND_DEBUG === 'true';
const WEBSEARCH_ENABLED = argv.includes('--websearch') || process.env.NABOKOV_BACKEND_WEBSEARCH === '1' || process.env.NABOKOV_BACKEND_WEBSEARCH === 'true';

const useColor = process.env.NABOKOV_BACKEND_COLOR !== '0' && process.stdout.isTTY;
const {
  bold,
  blue,
  cyan,
  dim,
  green,
  magenta,
  red,
  white,
  yellow,
} = createColors({ useColor });

const levelPalette = {
  debug: magenta,
  info: cyan,
  warn: yellow,
  error: red,
};

const app = express();
const PORT = Number(process.env.PORT) || 3100;
const HOST = process.env.HOST || '0.0.0.0';

let llmService;
try {
  llmService = createLLMService({ websearchEnabled: WEBSEARCH_ENABLED });
  console.log(`[Backend] Using LLM provider: ${llmService.getProviderName()}`);
} catch (error) {
  console.error('[Backend] Failed to initialize LLM provider:', error);
  process.exit(1);
}

if (DEBUG_MODE) {
  console.log('[Backend] Debug logging enabled');
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

function handleMultimodalFallback(res) {
  res.status(501).json({
    error: 'Multimodal messages not supported by current provider',
    fallbackToDirect: true,
  });
}

function ensureSSEHeaders(res) {
  if (res.headersSent) {
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
}

function truncateForLog(value, length = 80) {
  if (!value || typeof value !== 'string') {
    return '';
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  if (normalized.length <= length) {
    return normalized;
  }

  return `${normalized.slice(0, length - 3)}...`;
}

function flattenContent(content) {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map(item => {
        if (!item) {
          return '';
        }

        if (typeof item === 'string') {
          return item;
        }

        if (typeof item === 'object' && typeof item.text === 'string') {
          return item.text;
        }

        return '';
      })
      .join(' ');
  }

  return '';
}

function summarizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return {
      count: 0,
      lastRole: 'unknown',
      containsMultimodal: false,
      latestUserPreview: '',
      totalChars: 0,
    };
  }

  const count = messages.length;
  const lastRole = messages[count - 1]?.role || 'unknown';
  const containsMultimodal = messages.some(message => Array.isArray(message?.content));
  const totalChars = messages.reduce((sum, message) => sum + flattenContent(message?.content).length, 0);

  const latestUser = [...messages].reverse().find(message => message?.role === 'user');
  const latestUserPreview = latestUser ? truncateForLog(flattenContent(latestUser.content)) : '';

  return {
    count,
    lastRole,
    containsMultimodal,
    latestUserPreview,
    totalChars,
  };
}

function summarizeOptions(options) {
  if (!options || typeof options !== 'object') {
    return {};
  }

  const summary = {};

  if (typeof options.model === 'string') {
    summary.model = options.model;
  }

  if (typeof options.maxTokens === 'number') {
    summary.maxTokens = options.maxTokens;
  }

  if (Array.isArray(options.tools)) {
    summary.tools = options.tools.length;
  }

  if (options.tool_choice) {
    summary.toolChoice = typeof options.tool_choice === 'string' ? options.tool_choice : 'custom';
  }

  if (options.system) {
    summary.systemPrompt = true;
  }

  if (options.providerOptions && typeof options.providerOptions === 'object') {
    const providerSummary = {};
    if (typeof options.providerOptions.model === 'string') {
      providerSummary.model = options.providerOptions.model;
    }
    if (typeof options.providerOptions.maxTokens === 'number') {
      providerSummary.maxTokens = options.providerOptions.maxTokens;
    }
    if (Object.keys(providerSummary).length > 0) {
      summary.providerOptions = providerSummary;
    }
  }

  return summary;
}

function optionsContainModel(options) {
  if (!options || typeof options !== 'object') {
    return false;
  }

  if (typeof options.model === 'string' && options.model.trim().length > 0) {
    return true;
  }

  const providerOptions = options.providerOptions;
  return !!(providerOptions && typeof providerOptions === 'object' && typeof providerOptions.model === 'string' && providerOptions.model.trim().length > 0);
}

function stripModelFromOptions(options) {
  if (!options || typeof options !== 'object') {
    return {};
  }

  const sanitized = { ...options };

  if (sanitized.providerOptions && typeof sanitized.providerOptions === 'object') {
    const providerOptions = { ...sanitized.providerOptions };
    delete providerOptions.model;
    if (Object.keys(providerOptions).length > 0) {
      sanitized.providerOptions = providerOptions;
    } else {
      delete sanitized.providerOptions;
    }
  }

  delete sanitized.model;

  return sanitized;
}

function colorizeStatus(value) {
  const code = Number(value);
  if (Number.isNaN(code)) {
    return value;
  }

  if (code >= 500) {
    return red(value);
  }

  if (code >= 400) {
    return yellow(value);
  }

  return green(value);
}

function colorizeDuration(value) {
  const duration = Number(value);
  if (Number.isNaN(duration)) {
    return value;
  }

  if (duration < 2000) {
    return green(value);
  }

  if (duration < 10000) {
    return yellow(value);
  }

  return red(value);
}

function colorizeValue(label, raw, level) {
  if (!useColor) {
    return raw;
  }

  switch (label) {
    case 'status':
      return colorizeStatus(raw);
    case 'durationMs':
      return colorizeDuration(raw);
    case 'requestedModel':
      return yellow(raw);
    case 'resolvedModel':
      return cyan(raw);
    case 'provider':
      return magenta(raw);
    case 'notes':
    case 'reason':
      return yellow(raw);
    case 'message':
      return level === 'error' ? red(raw) : raw;
    default:
      return raw;
  }
}

function formatField(label, value, level) {
  if (value === undefined || value === null || value === '' || (typeof value === 'number' && Number.isNaN(value))) {
    return [];
  }

  const serialized = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : JSON.stringify(value, null, 2);

  const lines = serialized.split('\n');
  const labelText = useColor ? dim(label) : label;
  const continuationPrefix = useColor ? `${dim('|')} ` : '| ';

  return lines.map((line, index) => {
    const coloredLine = colorizeValue(label, line, level);
    if (index === 0) {
      return `  ${labelText}: ${coloredLine}`;
    }

    return `    ${continuationPrefix}${coloredLine}`;
  });
}

function decorateHeader(level, header) {
  if (!useColor) {
    return header;
  }

  const palette = levelPalette[level] || levelPalette.info;
  const match = header.match(/^\[Backend\]\s+\[([^\]]+)\]\s+(\w+)\s+(.*)$/);
  if (!match) {
    return palette(bold(header));
  }

  const [, id, action, rest] = match;
  const verb = action.toLowerCase();
  const actionPalette = {
    incoming: cyan,
    completed: green,
    retrying: yellow,
    error: red,
    debug: magenta,
  }[verb] || palette;
  const restMatch = rest.match(/^([A-Z]+)\s+(.*)$/);
  let formattedRest = rest;
  if (restMatch) {
    const [, method, path] = restMatch;
    formattedRest = `${blue(method)} ${white(path)}`;
  }

  return `${dim('[Backend]')} ${bold(palette(`[${id}]`))} ${bold(actionPalette(action))} ${formattedRest}`;
}

function structuredLog(level, header, fields) {
  const lines = [decorateHeader(level, header)];
  for (const field of fields) {
    lines.push(...formatField(field.label, field.value, level));
  }

  const output = lines.join('\n');
  if (level === 'error') {
    console.error(output);
  } else {
    console.log(output);
  }
}

function createRequestLogger(req, { stream = false } = {}) {
  const id = randomBytes(4).toString('hex');
  const startedAt = Date.now();
  const timestamp = new Date(startedAt).toISOString();
  const method = req.method;
  const path = req.path;
  const body = req.body ?? {};
  const messagesSummary = summarizeMessages(body.messages);
  const optionsSummary = summarizeOptions(body.options);

  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
  const userAgent = req.get('user-agent');

  const fields = [
    { label: 'timestamp', value: timestamp },
    { label: 'messages', value: messagesSummary.count },
    { label: 'lastRole', value: messagesSummary.lastRole },
    { label: 'inputChars', value: messagesSummary.totalChars || undefined },
    { label: 'latestUser', value: messagesSummary.latestUserPreview || undefined },
    { label: 'multimodal', value: messagesSummary.containsMultimodal ? true : undefined },
    { label: 'stream', value: stream ? true : undefined },
    { label: 'options', value: Object.keys(optionsSummary).length ? optionsSummary : undefined },
    { label: 'clientIp', value: clientIp || undefined },
    { label: 'userAgent', value: userAgent ? truncateForLog(userAgent, 120) : undefined },
  ];

  structuredLog('info', `[Backend] [${id}] Incoming ${method} ${path}`, fields);

  const logCompletion = (status, extras = {}) => {
    const durationMs = Date.now() - startedAt;
    structuredLog('info', `[Backend] [${id}] Completed ${method} ${path}`, [
      { label: 'status', value: status },
      { label: 'durationMs', value: durationMs },
      { label: 'provider', value: extras.provider },
      { label: 'requestedModel', value: extras.requestedModel },
      { label: 'resolvedModel', value: extras.resolvedModel },
      { label: 'responseChars', value: extras.responseChars },
      { label: 'metadata', value: extras.metadata && Object.keys(extras.metadata).length ? extras.metadata : undefined },
      { label: 'notes', value: extras.notes },
    ]);
  };

  const logError = (error, extras = {}) => {
    const durationMs = Date.now() - startedAt;
    structuredLog('error', `[Backend] [${id}] Error ${method} ${path}`, [
      { label: 'durationMs', value: durationMs },
      { label: 'message', value: error?.message || 'Unknown error' },
      { label: 'code', value: error?.code },
      { label: 'requestedModel', value: extras.requestedModel || error?.requestedModel },
      { label: 'resolvedModel', value: extras.resolvedModel },
      { label: 'metadata', value: extras.metadata && Object.keys(extras.metadata).length ? extras.metadata : undefined },
    ]);
  };

  const logFallback = (context = {}) => {
    structuredLog('info', `[Backend] [${id}] Retrying ${method} ${path}`, [
      { label: 'reason', value: context.reason || 'UNSUPPORTED_MODEL' },
      { label: 'requestedModel', value: context.requestedModel },
      { label: 'action', value: context.action || 'using default model' },
    ]);
  };

  const logDebug = (label, fields = []) => {
    if (!DEBUG_MODE) {
      return;
    }

    const normalizedFields = (Array.isArray(fields) ? fields : [fields])
      .filter(Boolean)
      .map(field => (field && typeof field === 'object' && Object.prototype.hasOwnProperty.call(field, 'label')
        ? field
        : { label: 'data', value: field }));

    structuredLog('debug', `[Backend] [${id}] Debug ${label}`, normalizedFields);
  };

  return {
    id,
    method,
    path,
    stream,
    logCompletion,
    logError,
    logFallback,
    logDebug,
  };
}

function handleRequestError(res, error, requestLogger) {
  if (error?.code === 'INVALID_REQUEST') {
    requestLogger?.logError(error);
    return res.status(400).json({ error: error.message });
  }

  if (error?.code === 'UNSUPPORTED_MULTIMODAL') {
    requestLogger?.logError(error);
    return handleMultimodalFallback(res);
  }

  if (error?.code === 'UNSUPPORTED_MODEL') {
    requestLogger?.logError(error);
    return res.status(400).json({
      error: 'Codex provider does not support the requested model. Configure CODEX_MODEL or remove the model option.',
      provider: llmService.getProviderName(),
      requestedModel: error.requestedModel,
    });
  }

  if (!requestLogger) {
    console.error('[Backend] Error processing request:', error);
  } else {
    requestLogger.logError(error);
  }

  return res.status(500).json({
    error: error?.message || 'Internal server error',
    details: error?.stack,
  });
}

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    message: 'Nabokov backend server is running',
    provider: llmService.getProviderName(),
  });
});

/**
 * Text-based message endpoint
 */
app.post('/api/message', async (req, res) => {
  const requestLogger = createRequestLogger(req);
  const { messages, options = {} } = req.body ?? {};

  let attemptOptions = options;
  let fallbackUsed = false;
  let fallbackInfo;

  while (true) {
    try {
      const response = await llmService.sendMessage({ messages, options: attemptOptions });
      const responseText = typeof response?.content === 'string' ? response.content : '';
      const requestedModel = response?.metadata?.requestedModel;
      const resolvedModel = response?.metadata?.resolvedModel;
      requestLogger.logDebug('response', [
        { label: 'content', value: responseText ? `\n${responseText}` : '' },
        { label: 'metadata', value: response?.metadata },
      ]);
      const notesList = [];
      if (requestedModel && resolvedModel && requestedModel !== resolvedModel) {
        notesList.push(`model fallback applied (${requestedModel} → ${resolvedModel})`);
      }
      if (fallbackUsed) {
        notesList.push('default model fallback applied');
      }
      const metadataForLog = { ...(response?.metadata ?? {}) };
      delete metadataForLog.requestedModel;
      delete metadataForLog.resolvedModel;
      if (fallbackUsed && fallbackInfo?.requestedModel) {
        metadataForLog.fallbackRequestedModel = fallbackInfo.requestedModel;
      }
      requestLogger.logCompletion(200, {
        provider: response?.metadata?.provider || llmService.getProviderName(),
        requestedModel,
        resolvedModel,
        responseChars: responseText.length,
        metadata: Object.keys(metadataForLog).length ? metadataForLog : undefined,
        notes: notesList.length ? notesList.join(' | ') : undefined,
      });
      res.json(response);
      return;
    } catch (error) {
      if (!fallbackUsed && error?.code === 'UNSUPPORTED_MODEL' && optionsContainModel(attemptOptions)) {
        fallbackUsed = true;
        fallbackInfo = {
          requestedModel: error.requestedModel || attemptOptions?.model || attemptOptions?.providerOptions?.model,
        };
        requestLogger.logFallback({ requestedModel: fallbackInfo.requestedModel });
        attemptOptions = stripModelFromOptions(attemptOptions);
        continue;
      }

      handleRequestError(res, error, requestLogger);
      return;
    }
  }
});

/**
 * Streaming message endpoint (Server-Sent Events)
 */
app.post('/api/stream', async (req, res) => {
  const requestLogger = createRequestLogger(req, { stream: true });
  const { messages, options = {} } = req.body ?? {};
  let emittedChars = 0;
  let eventCount = 0;
  let streamMetadata;

  const sendErrorEvent = error => {
    const payload = {
      error: error?.message || 'Stream error',
    };

    if (error?.code) {
      payload.code = error.code;
    }

    if (error?.requestedModel) {
      payload.requestedModel = error.requestedModel;
    }

    ensureSSEHeaders(res);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
    res.end();
  };

  let fallbackUsed = false;
  let fallbackInfo;

  const runStream = async (currentOptions, isFallback = false) => {
    emittedChars = 0;
    eventCount = 0;
    streamMetadata = undefined;
    let debugTokens = DEBUG_MODE ? [] : null;
    let lastChar = '\n';

    await llmService.streamMessage({
      messages,
      options: currentOptions,
      onToken: token => {
        ensureSSEHeaders(res);
        let text = typeof token === 'string' ? token : token != null ? String(token) : '';
        if (!text) {
          return;
        }
        const startsWithWhitespace = /^\s/.test(text);
        const lastCharIsWhitespace = /\s/.test(lastChar);
        if (!lastCharIsWhitespace && !startsWithWhitespace) {
          text = `\n${text}`;
        }
        const trailingChar = text[text.length - 1];
        if (trailingChar) {
          lastChar = trailingChar;
        }
        res.write(`data: ${JSON.stringify({ delta: { text } })}\n\n`);
        emittedChars += text?.length || 0;
        eventCount += 1;
        if (Array.isArray(debugTokens) && typeof text === 'string') {
          debugTokens.push(text);
        }
      },
      onDone: metadata => {
        ensureSSEHeaders(res);
        res.write('data: [DONE]\n\n');
        res.end();
        streamMetadata = metadata || streamMetadata || {};
        if (Array.isArray(debugTokens)) {
          const combined = debugTokens.join('');
          const deltas = debugTokens.length ? `\n${debugTokens.join('\n')}` : undefined;
          requestLogger.logDebug('response', [
            { label: 'content', value: combined ? `\n${combined}` : '' },
            { label: 'deltas', value: deltas },
            { label: 'events', value: eventCount },
            { label: 'metadata', value: streamMetadata },
          ]);
        }
        const requestedModel = streamMetadata?.requestedModel;
        const resolvedModel = streamMetadata?.resolvedModel;
        const notesList = [];
        if (requestedModel && resolvedModel && requestedModel !== resolvedModel) {
          notesList.push(`model fallback applied (${requestedModel} → ${resolvedModel})`);
        }
        if (fallbackUsed || isFallback) {
          notesList.push('default model fallback applied');
        }
        const { requestedModel: _req, resolvedModel: _res, ...restMetadata } = streamMetadata || {};
        const metadataForLog = {
          events: eventCount,
          ...restMetadata,
        };
        if ((fallbackUsed || isFallback) && fallbackInfo?.requestedModel) {
          metadataForLog.fallbackRequestedModel = fallbackInfo.requestedModel;
        }
        requestLogger.logCompletion(200, {
          provider: llmService.getProviderName(),
          responseChars: emittedChars,
          requestedModel,
          resolvedModel,
          metadata: Object.keys(metadataForLog).length ? metadataForLog : undefined,
          notes: notesList.length ? notesList.join(' | ') : undefined,
        });
      },
      onError: async error => {
        if (!isFallback && !fallbackUsed && error?.code === 'UNSUPPORTED_MODEL' && optionsContainModel(currentOptions)) {
          fallbackUsed = true;
          fallbackInfo = {
            requestedModel: error.requestedModel || currentOptions?.model || currentOptions?.providerOptions?.model,
          };
          requestLogger.logFallback({ requestedModel: fallbackInfo.requestedModel });
          const sanitizedOptions = stripModelFromOptions(currentOptions);
          try {
            await runStream(sanitizedOptions, true);
          } catch (fallbackError) {
            requestLogger.logError(fallbackError, {
              requestedModel: sanitizedOptions?.model,
              metadata: { fallback: true },
            });
            if (res.headersSent) {
              sendErrorEvent(fallbackError);
            } else if (fallbackError?.code === 'INVALID_REQUEST') {
              res.status(400).json({ error: fallbackError.message });
            } else if (fallbackError?.code === 'UNSUPPORTED_MULTIMODAL') {
              res.status(501).json({
                error: 'Multimodal messages not supported by current provider',
                fallbackToDirect: true,
              });
            } else {
              res.status(500).json({ error: fallbackError?.message || 'Internal server error' });
            }
          }
          return;
        }

        const { requestedModel: reqModel, resolvedModel: resModel, ...restMetadata } = streamMetadata || {};
        requestLogger.logError(error, {
          requestedModel: reqModel,
          resolvedModel: resModel,
          metadata: restMetadata,
        });
        if (error?.code === 'UNSUPPORTED_MODEL') {
          const unsupported = new Error('Codex provider does not support the requested model. Configure CODEX_MODEL or remove the model option.');
          unsupported.code = 'UNSUPPORTED_MODEL';
          unsupported.requestedModel = error.requestedModel;
          sendErrorEvent(unsupported);
        } else {
          sendErrorEvent(error);
        }
      },
    });
  };

  try {
    await runStream(options, false);
  } catch (error) {
    if (!fallbackUsed && error?.code === 'UNSUPPORTED_MODEL' && optionsContainModel(options)) {
      fallbackUsed = true;
      fallbackInfo = {
        requestedModel: error.requestedModel || options?.model || options?.providerOptions?.model,
      };
      requestLogger.logFallback({ requestedModel: fallbackInfo.requestedModel });
      try {
        await runStream(stripModelFromOptions(options), true);
        return;
      } catch (fallbackError) {
        error = fallbackError;
      }
    }

    if (error?.code === 'UNSUPPORTED_MULTIMODAL') {
      res.status(501).json({
        error: 'Multimodal messages not supported by current provider',
        fallbackToDirect: true,
      });
      return;
    }

    if (error?.code === 'INVALID_REQUEST') {
      res.status(400).json({ error: error.message });
      return;
    }

    if (error?.code === 'UNSUPPORTED_MODEL') {
      res.status(400).json({
        error: 'Codex provider does not support the requested model. Configure CODEX_MODEL or remove the model option.',
        provider: llmService.getProviderName(),
        requestedModel: error.requestedModel,
      });
      return;
    }

    requestLogger.logError(error, {
      requestedModel: streamMetadata?.requestedModel,
      resolvedModel: streamMetadata?.resolvedModel,
    });
    if (res.headersSent) {
      sendErrorEvent(error);
    } else {
      res.status(500).json({ error: error?.message || 'Internal server error' });
    }
  }
});

/**
 * Start server
 */
if (process.env.NABOKOV_BACKEND_NO_LISTEN === '1') {
  console.log('[Backend] Listen skipped (NABOKOV_BACKEND_NO_LISTEN=1)');
} else {
  app.listen(PORT, HOST, () => {
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('  🚀 Nabokov Backend Server');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    console.log(`  Status: Running`);
    console.log(`  Host: ${HOST}`);
    console.log(`  Port: ${PORT}`);
    console.log(`  Health: http://localhost:${PORT}/health`);
    console.log('');
    console.log('  Endpoints:');
    console.log(`    POST http://localhost:${PORT}/api/message`);
    console.log(`    POST http://localhost:${PORT}/api/stream`);
    console.log('');
    console.log('  Provider:');
    console.log(`    Active: ${llmService.getProviderName()} (${llmService.getProviderKey()})`);
    console.log('');
    console.log('  Features:');
    console.log(`    Websearch: ${WEBSEARCH_ENABLED ? '✓ Enabled' : '✗ Disabled'}`);
    console.log('');
    console.log('  Configuration:');
    console.log('    Enable websearch: --websearch or NABOKOV_BACKEND_WEBSEARCH=1');
    console.log('    Debug mode: --debug or NABOKOV_BACKEND_DEBUG=1');
    console.log('');
    console.log('  Authentication / Execution:');
    console.log('    - Claude Agent SDK (if provider = claude)');
    console.log('    - Codex CLI (if provider = codex, default)');
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    console.log('Press Ctrl+C to stop');
    console.log('');
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down Nabokov backend server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n👋 Shutting down Nabokov backend server...');
  process.exit(0);
});
