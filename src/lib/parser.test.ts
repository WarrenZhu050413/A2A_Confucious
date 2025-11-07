import { describe, it, expect } from 'vitest';
import { parseModelResponse } from './parser';

describe('parseModelResponse', () => {
  describe('JSON format parsing', () => {
    it('should parse JSON with "final" field', () => {
      const input = JSON.stringify({
        final: 'This is the final text',
        reasoning: 'This is my reasoning',
        addressees: ['confucius', 'mencius'],
      });

      const result = parseModelResponse(input);

      expect(result.finalText).toBe('This is the final text');
      expect(result.reasoning).toBe('This is my reasoning');
      expect(result.addressees).toEqual(['confucius', 'mencius']);
    });

    it('should parse JSON with "answer" field as fallback', () => {
      const input = JSON.stringify({
        answer: 'This is the answer',
        analysis: 'This is my analysis',
      });

      const result = parseModelResponse(input);

      expect(result.finalText).toBe('This is the answer');
      expect(result.reasoning).toBe('This is my analysis');
    });

    it('should parse JSON with "response" field as fallback', () => {
      const input = JSON.stringify({
        response: 'This is the response',
      });

      const result = parseModelResponse(input);

      expect(result.finalText).toBe('This is the response');
    });

    it('should parse JSON with "surface" field as fallback', () => {
      const input = JSON.stringify({
        surface: 'This is the surface text',
      });

      const result = parseModelResponse(input);

      expect(result.finalText).toBe('This is the surface text');
    });

    it('should parse JSON with "thinking" field as reasoning fallback', () => {
      const input = JSON.stringify({
        final: 'Final text',
        thinking: 'My thinking process',
      });

      const result = parseModelResponse(input);

      expect(result.finalText).toBe('Final text');
      expect(result.reasoning).toBe('My thinking process');
    });

    it('should parse JSON with "recipients" field as addressees fallback', () => {
      const input = JSON.stringify({
        final: 'Hello',
        recipients: ['laozi', 'zhuangzi'],
      });

      const result = parseModelResponse(input);

      expect(result.addressees).toEqual(['laozi', 'zhuangzi']);
    });

    it('should parse JSON with "to" field as addressees fallback', () => {
      const input = JSON.stringify({
        final: 'Greetings',
        to: ['mozi'],
      });

      const result = parseModelResponse(input);

      expect(result.addressees).toEqual(['mozi']);
    });

    it('should handle JSON embedded in text', () => {
      const input = 'Some prefix text {"final": "Embedded JSON", "reasoning": "Deep thought"} Some suffix text';

      const result = parseModelResponse(input);

      expect(result.finalText).toBe('Embedded JSON');
      expect(result.reasoning).toBe('Deep thought');
    });

    it('should trim whitespace from parsed values', () => {
      const input = JSON.stringify({
        final: '  Final text with spaces  ',
        reasoning: '  Reasoning with spaces  ',
        addressees: ['  confucius  ', '  mencius  '],
      });

      const result = parseModelResponse(input);

      expect(result.finalText).toBe('Final text with spaces');
      expect(result.reasoning).toBe('Reasoning with spaces');
      expect(result.addressees).toEqual(['confucius', 'mencius']);
    });

    it('should filter out empty addressees', () => {
      const input = JSON.stringify({
        final: 'Hello',
        addressees: ['confucius', '', '  ', 'mencius'],
      });

      const result = parseModelResponse(input);

      expect(result.addressees).toEqual(['confucius', 'mencius']);
    });

    it('should filter out non-string addressees', () => {
      const input = JSON.stringify({
        final: 'Hello',
        addressees: ['confucius', null, 123, 'mencius', undefined, true],
      });

      const result = parseModelResponse(input);

      expect(result.addressees).toEqual(['confucius', 'mencius']);
    });

    it('should return undefined addressees if array is empty after filtering', () => {
      const input = JSON.stringify({
        final: 'Hello',
        addressees: ['', '  ', null],
      });

      const result = parseModelResponse(input);

      expect(result.addressees).toBeUndefined();
    });

    it('should ignore empty final text from JSON', () => {
      const input = JSON.stringify({
        final: '',
        reasoning: 'Some reasoning',
      });

      const result = parseModelResponse(input);

      // Falls back to the raw input
      expect(result.finalText).toBe(input);
      expect(result.reasoning).toBe('Some reasoning');
    });

    it('should handle malformed JSON gracefully', () => {
      const input = '{this is not valid JSON}';

      const result = parseModelResponse(input);

      expect(result.finalText).toBe(input);
      expect(result.reasoning).toBeUndefined();
      expect(result.addressees).toBeUndefined();
    });

    it('should handle JSON with no relevant fields', () => {
      const input = JSON.stringify({
        irrelevant: 'data',
        other: 'fields',
      });

      const result = parseModelResponse(input);

      // Falls back to the raw input
      expect(result.finalText).toBe(input);
    });
  });

  describe('Double-newline format parsing', () => {
    it('should parse reasoning and text separated by double newline', () => {
      const input = 'This is my reasoning\n\nThis is the final text';

      const result = parseModelResponse(input);

      expect(result.finalText).toBe('This is the final text');
      expect(result.reasoning).toBe('This is my reasoning');
    });

    it('should handle Windows-style line endings', () => {
      const input = 'This is my reasoning\r\n\r\nThis is the final text';

      const result = parseModelResponse(input);

      expect(result.finalText).toBe('This is the final text');
      expect(result.reasoning).toBe('This is my reasoning');
    });

    it('should not split on single newline', () => {
      const input = 'Line 1\nLine 2\nLine 3';

      const result = parseModelResponse(input);

      expect(result.finalText).toBe(input);
      expect(result.reasoning).toBeUndefined();
    });

    it('should not split if first part is empty', () => {
      const input = '\n\nThis is just text';

      const result = parseModelResponse(input);

      expect(result.finalText).toBe('This is just text');
      expect(result.reasoning).toBeUndefined();
    });

    it('should not split if second part is empty', () => {
      const input = 'This is just text\n\n';

      const result = parseModelResponse(input);

      expect(result.finalText).toBe('This is just text');
      expect(result.reasoning).toBeUndefined();
    });

    it('should prefer JSON reasoning over double-newline format', () => {
      const input = JSON.stringify({
        final: 'JSON final',
        reasoning: 'JSON reasoning',
      });

      const result = parseModelResponse(input);

      expect(result.finalText).toBe('JSON final');
      expect(result.reasoning).toBe('JSON reasoning');
    });

    it('should use double-newline format when JSON parsing fails', () => {
      // The JSON substring extraction fails because it's not valid on its own
      // so parser falls back to double-newline format
      const input = 'Reasoning part\n\n{"final": "JSON final"}';

      const result = parseModelResponse(input);

      // Falls back to double-newline parsing
      expect(result.finalText).toBe('{"final": "JSON final"}');
      expect(result.reasoning).toBe('Reasoning part');
    });
  });

  describe('Plain text fallback', () => {
    it('should return plain text when no JSON or separator found', () => {
      const input = 'Just some plain text';

      const result = parseModelResponse(input);

      expect(result.finalText).toBe('Just some plain text');
      expect(result.reasoning).toBeUndefined();
      expect(result.addressees).toBeUndefined();
    });

    it('should trim plain text', () => {
      const input = '   Plain text with spaces   ';

      const result = parseModelResponse(input);

      expect(result.finalText).toBe('Plain text with spaces');
    });

    it('should handle empty string', () => {
      const input = '';

      const result = parseModelResponse(input);

      expect(result.finalText).toBe('');
      expect(result.reasoning).toBeUndefined();
      expect(result.addressees).toBeUndefined();
    });

    it('should handle whitespace-only string', () => {
      const input = '   \n  \t  ';

      const result = parseModelResponse(input);

      expect(result.finalText).toBe('');
    });
  });

  describe('Edge cases', () => {
    it('should handle non-string input gracefully', () => {
      const result = parseModelResponse(null as unknown as string);

      expect(result.finalText).toBe('');
    });

    it('should handle undefined input gracefully', () => {
      const result = parseModelResponse(undefined as unknown as string);

      expect(result.finalText).toBe('');
    });

    it('should handle number input gracefully', () => {
      const result = parseModelResponse(123 as unknown as string);

      expect(result.finalText).toBe('');
    });

    it('should handle object input gracefully', () => {
      const input = { final: 'text' };
      const result = parseModelResponse(input as unknown as string);

      expect(result.finalText).toBe('');
    });

    it('should handle very long text', () => {
      const longText = 'a'.repeat(10000);
      const input = JSON.stringify({ final: longText });

      const result = parseModelResponse(input);

      expect(result.finalText).toBe(longText);
    });

    it('should handle nested JSON objects', () => {
      const input = JSON.stringify({
        final: 'Final text',
        reasoning: 'Reasoning',
        metadata: {
          nested: 'data',
        },
      });

      const result = parseModelResponse(input);

      expect(result.finalText).toBe('Final text');
      expect(result.reasoning).toBe('Reasoning');
    });

    it('should fall back to raw text when multiple JSON objects are invalid', () => {
      const input = '{"final": "First"} {"final": "Second"}';

      const result = parseModelResponse(input);

      // Extracts from first { to last }, but that's invalid JSON, so falls back
      expect(result.finalText).toBe(input);
      expect(result.reasoning).toBeUndefined();
      expect(result.addressees).toBeUndefined();
    });
  });
});
