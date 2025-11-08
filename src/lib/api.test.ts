import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sendMessageToBackend, healthCheck } from './api';
import type { ClaudeMessagePayload } from './api';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('api', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('sendMessageToBackend', () => {
    const validPayload: ClaudeMessagePayload = {
      messages: [{ role: 'user', content: 'Hello' }],
    };

    it('should send POST request to /api/message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: 'Response' }),
      });

      await sendMessageToBackend(validPayload);

      expect(mockFetch).toHaveBeenCalledWith('/api/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validPayload),
      });
    });

    it('should return parsed JSON response', async () => {
      const mockResponse = {
        content: 'Test response',
        metadata: { model: 'claude-3' },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await sendMessageToBackend(validPayload);

      expect(result).toEqual(mockResponse);
    });

    it('should handle response without metadata', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: 'Just content' }),
      });

      const result = await sendMessageToBackend(validPayload);

      expect(result.content).toBe('Just content');
      expect(result.metadata).toBeUndefined();
    });

    it('should throw error for non-OK response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal server error',
      });

      await expect(sendMessageToBackend(validPayload)).rejects.toThrow(
        'Backend error 500: Internal server error'
      );
    });

    it('should throw error for 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not found',
      });

      await expect(sendMessageToBackend(validPayload)).rejects.toThrow('Backend error 404');
    });

    it('should throw error for 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      await expect(sendMessageToBackend(validPayload)).rejects.toThrow('Backend error 401');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(sendMessageToBackend(validPayload)).rejects.toThrow('Network error');
    });

    it('should handle JSON parse errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      await expect(sendMessageToBackend(validPayload)).rejects.toThrow('Invalid JSON');
    });

    it('should send payload with options', async () => {
      const payloadWithOptions: ClaudeMessagePayload = {
        messages: [{ role: 'user', content: 'Hello' }],
        options: { temperature: 0.7, max_tokens: 1000 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: 'Response' }),
      });

      await sendMessageToBackend(payloadWithOptions);

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs?.[1]?.body as string);
      expect(body.options).toEqual({ temperature: 0.7, max_tokens: 1000 });
    });

    it('should handle empty messages array', async () => {
      const emptyPayload: ClaudeMessagePayload = {
        messages: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: 'Response' }),
      });

      const result = await sendMessageToBackend(emptyPayload);

      expect(result.content).toBe('Response');
    });

    it('should handle multiple messages', async () => {
      const multiMessagePayload: ClaudeMessagePayload = {
        messages: [
          { role: 'user', content: 'First' },
          { role: 'assistant', content: 'Second' },
          { role: 'user', content: 'Third' },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: 'Response' }),
      });

      await sendMessageToBackend(multiMessagePayload);

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs?.[1]?.body as string);
      expect(body.messages).toHaveLength(3);
    });
  });

  describe('healthCheck', () => {
    it('should return true for healthy backend', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok' }),
      });

      const result = await healthCheck();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('/health');
    });

    it('should return false for non-OK response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ status: 'error' }),
      });

      const result = await healthCheck();

      expect(result).toBe(false);
    });

    it('should return false for incorrect status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'error' }),
      });

      const result = await healthCheck();

      expect(result).toBe(false);
    });

    it('should return false for missing status field', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const result = await healthCheck();

      expect(result).toBe(false);
    });

    it('should return false for network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await healthCheck();

      expect(result).toBe(false);
    });

    it('should return false for JSON parse errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      const result = await healthCheck();

      expect(result).toBe(false);
    });

    it('should not throw on errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Catastrophic failure'));

      await expect(healthCheck()).resolves.toBe(false);
    });
  });

  describe('error handling edge cases', () => {
    const validPayload: ClaudeMessagePayload = {
      messages: [{ role: 'user', content: 'Hello' }],
    };

    it('should handle response with empty error text', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => '',
      });

      await expect(sendMessageToBackend(validPayload)).rejects.toThrow('Backend error 500');
    });

    it('should handle very long error messages', async () => {
      const longError = 'A'.repeat(10000);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => longError,
      });

      await expect(sendMessageToBackend(validPayload)).rejects.toThrow();
    });

    it('should handle response text that throws', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => {
          throw new Error('Cannot read response');
        },
      });

      await expect(sendMessageToBackend(validPayload)).rejects.toThrow();
    });
  });

  describe('content type handling', () => {
    const validPayload: ClaudeMessagePayload = {
      messages: [{ role: 'user', content: 'Hello' }],
    };

    it('should set Content-Type header to application/json', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: 'Response' }),
      });

      await sendMessageToBackend(validPayload);

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs?.[1]?.headers).toEqual({
        'Content-Type': 'application/json',
      });
    });
  });
});
