/**
 * Model Response Parser
 *
 * Parses LLM responses which may contain JSON or plain text.
 * Extracts the final message text, reasoning/analysis, and addressee list.
 */

export interface ParsedResponse {
  finalText: string;
  reasoning?: string;
  addressees?: string[];
}

/**
 * Attempts to parse a model response, extracting structured data if present.
 *
 * Handles three formats:
 * 1. JSON embedded in text: {...JSON...}
 * 2. Double-newline separated reasoning + text
 * 3. Plain text fallback
 *
 * @param raw - Raw response text from the model
 * @returns Parsed response with finalText, optional reasoning, and optional addressees
 */
export const parseModelResponse = (raw: string): ParsedResponse => {
  const fallback = typeof raw === 'string' ? raw.trim() : '';
  let finalText = fallback;
  let reasoning: string | undefined;
  let addressees: string[] | undefined;

  if (typeof raw === 'string') {
    // Try to extract JSON from the response
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const candidate = raw.slice(firstBrace, lastBrace + 1);
      try {
        const parsed = JSON.parse(candidate);
        const maybeFinal =
          parsed.final ?? parsed.answer ?? parsed.response ?? parsed.surface;
        const maybeReasoning = parsed.reasoning ?? parsed.analysis ?? parsed.thinking;
        const maybeAddressees = parsed.addressees ?? parsed.recipients ?? parsed.to;

        if (typeof maybeFinal === 'string' && maybeFinal.trim()) {
          finalText = maybeFinal.trim();
        }
        if (typeof maybeReasoning === 'string' && maybeReasoning.trim()) {
          reasoning = maybeReasoning.trim();
        }
        if (Array.isArray(maybeAddressees) && maybeAddressees.length > 0) {
          const filtered = maybeAddressees
            .filter((a) => typeof a === 'string' && a.trim())
            .map((a) => a.trim());
          if (filtered.length > 0) {
            addressees = filtered;
          }
        }
      } catch {
        // ignore parse failure, fall back to raw text
      }
    }
  }

  // If no reasoning found via JSON, try double-newline separator format
  if (!reasoning && typeof raw === 'string') {
    const normalized = raw.replace(/\r\n/g, '\n');
    const separatorIndex = normalized.indexOf('\n\n');
    if (separatorIndex !== -1) {
      const leading = normalized.slice(0, separatorIndex).trim();
      const trailing = normalized.slice(separatorIndex + 2).trim();
      if (leading && trailing) {
        reasoning = leading;
        finalText = trailing;
      }
    }
  }

  return { finalText, reasoning, addressees };
};
