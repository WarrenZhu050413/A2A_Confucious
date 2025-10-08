export type ClaudeMessagePayload = {
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  options?: Record<string, unknown>;
};

export type ClaudeMessageResponse = {
  content: string;
  metadata?: Record<string, unknown>;
};

export async function sendMessageToBackend(
  payload: ClaudeMessagePayload,
): Promise<ClaudeMessageResponse> {
  const response = await fetch('/api/message', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Backend error ${response.status}: ${text}`);
  }

  return (await response.json()) as ClaudeMessageResponse;
}

export async function healthCheck(): Promise<boolean> {
  try {
    const response = await fetch('/health');
    if (!response.ok) return false;
    const json = await response.json();
    return json?.status === 'ok';
  } catch (error) {
    console.warn('Health check failed', error);
    return false;
  }
}
