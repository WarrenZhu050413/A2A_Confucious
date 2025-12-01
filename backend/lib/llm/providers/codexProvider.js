import { spawn as nodeSpawn } from 'node:child_process';
import readline from 'node:readline';

const DEFAULT_ARGS = ['exec', '--json'];

function buildArgs(options = {}) {
  const args = [...DEFAULT_ARGS];

  if (options.model) {
    args.splice(1, 0, '--model', String(options.model));
  }

  if (options.profile) {
    args.splice(1, 0, '--profile', String(options.profile));
  }

  if (Array.isArray(options.configOverrides)) {
    for (const override of options.configOverrides) {
      args.splice(1, 0, '--config', String(override));
    }
  }

  if (Array.isArray(options.extraArgs)) {
    args.push(...options.extraArgs.map(String));
  }

  return args;
}

const ENV_DEFAULTS = {
  model: process.env.CODEX_MODEL,
  profile: process.env.CODEX_PROFILE,
};

function parseCodexOptions(options = {}) {
  const providerOptions = options.providerOptions ?? {};

  const resolvedModel = providerOptions.model ?? ENV_DEFAULTS.model;

  const parsed = {
    profile: providerOptions.profile ?? ENV_DEFAULTS.profile,
    configOverrides: providerOptions.configOverrides ?? [],
    extraArgs: providerOptions.extraArgs,
    websearchEnabled: providerOptions.websearchEnabled ?? false,
  };

  if (resolvedModel) {
    parsed.model = resolvedModel;
  }

  // Add web_search config override if enabled
  if (parsed.websearchEnabled) {
    parsed.configOverrides = [
      ...parsed.configOverrides,
      'tools.web_search=true'
    ];
  }

  return parsed;
}

function createJsonLineIterator(stream, onLine) {
  const rl = readline.createInterface({ input: stream });
  rl.on('line', line => {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const event = JSON.parse(trimmed);
      onLine(event);
    } catch (error) {
      onLine({ type: 'parse_error', raw: trimmed, error });
    }
  });

  return rl;
}

function decorateCodexError(errorLike, requestedModel) {
  const error = errorLike instanceof Error ? errorLike : new Error(String(errorLike));
  // Match various unsupported model error patterns:
  // - "unsupported model"
  // - "model is not supported"
  // - "not supported when using"
  // - etc.
  if (/(?:unsupported|not supported).*?model|model.*?(?:unsupported|not supported)/i.test(error.message)) {
    error.code = 'UNSUPPORTED_MODEL';
  }
  if (requestedModel && !error.requestedModel) {
    error.requestedModel = requestedModel;
  }
  return error;
}

function handleCodexEvent(event, handlers) {
  const { onToken, onDone, onError, requestedModel } = handlers;

  if (event.type === 'parse_error') {
    onError(decorateCodexError(new Error(`Failed to parse Codex event: ${event.raw}`), requestedModel));
    return;
  }

  if (event.type === 'item.delta') {
    const text = event.delta?.text;
    if (typeof text === 'string' && text.length > 0) {
      onToken(text);
    }
    return;
  }

  if (event.type === 'item.completed') {
    const text = event.item?.text;
    if (typeof text === 'string' && text.length > 0) {
      onToken(text);
    }
    return;
  }

  if (event.type === 'turn.completed' || event.type === 'thread.completed') {
    onDone();
    return;
  }

  if (event.type === 'error' || event.type === 'exception') {
    onError(decorateCodexError(event.message || 'Codex CLI reported an error', requestedModel));
  }
}

function spawnCodexProcess(spawnImpl, prompt, options, handlers) {
  return new Promise((resolve, reject) => {
    const parsedOptions = parseCodexOptions(options);
    const args = buildArgs(parsedOptions);

    // Prompt comes via stdin
    args.push('-');

    const child = spawnImpl('codex', args, { stdio: ['pipe', 'pipe', 'pipe'] });

    let settled = false;
    const stderrChunks = [];
    const requestedModel = options.requestedModel;

    const safeReject = error => {
      if (settled) return;
      settled = true;
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
      reject(decorateCodexError(error, requestedModel));
    };

    const safeResolve = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const rl = createJsonLineIterator(child.stdout, event => {
      handleCodexEvent(event, {
        onToken: handlers.onToken,
        onDone: () => safeResolve(),
        onError: error => safeReject(error),
        requestedModel,
      });
    });

    child.stderr.on('data', chunk => {
      stderrChunks.push(chunk.toString());
    });

    child.on('error', error => {
      rl.close();
      safeReject(error);
    });

    child.on('close', code => {
      rl.close();
      if (code !== 0 && !settled) {
        const stderr = stderrChunks.join('').trim();
        safeReject(new Error(stderr || `Codex process exited with code ${code}`));
      } else {
        safeResolve();
      }
    });

    child.stdin.write(prompt);
    if (!prompt.endsWith('\n')) {
      child.stdin.write('\n');
    }
    child.stdin.end();
  });
}

export function createCodexProvider(spawnImpl = nodeSpawn) {
  const providerName = 'codex-cli';

  return {
    name: providerName,

    async send({ prompt, options = {} }) {
      let buffer = '';

      await spawnCodexProcess(spawnImpl, prompt, options, {
        onToken: token => {
          buffer += token;
        },
      });

      return {
        content: buffer,
        metadata: {
          provider: providerName,
          timestamp: Date.now(),
        }
      };
    },

    async stream({ prompt, options = {}, onToken, onDone, onError }) {
      try {
        await spawnCodexProcess(spawnImpl, prompt, options, { onToken });
        onDone();
      } catch (error) {
        onError(error);
      }
    }
  };
}

export const codexProvider = createCodexProvider();
