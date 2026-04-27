import type { ChatMessage } from '../types';
import { getLLMSettings } from './llm';
import { apiUrl, ensureApiAvailable } from './config';

type StreamOptions = {
  signal?: AbortSignal;
  onAbort?: () => void;
};

function isAbortError(err: unknown): boolean {
  if (!err) return false;
  if (typeof DOMException !== 'undefined' && err instanceof DOMException) {
    return err.name === 'AbortError';
  }
  return err instanceof Error && err.name === 'AbortError';
}

function parseSseBuffer(
  buffer: string,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (error: string) => void
): { shouldStop: boolean; rest: string } {
  const lines = buffer.split('\n');
  const rest = lines.pop() || '';

  for (const line of lines) {
    if (!line.trim()) continue;
    if (!line.startsWith('data: ')) continue;

    const data = line.slice(6).trim();
    if (data === '[DONE]') {
      onDone();
      return { shouldStop: true, rest: '' };
    }

    try {
      const parsed = JSON.parse(data);
      if (parsed.error) {
        onError(parsed.error);
        return { shouldStop: true, rest: '' };
      }
      if (parsed.text) onChunk(parsed.text);
    } catch {
      // Ignore partial/broken chunk JSON
    }
  }

  return { shouldStop: false, rest };
}

async function streamViaSse(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  ensureLabel: string,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
  options?: StreamOptions
): Promise<void> {
  try {
    ensureApiAvailable(ensureLabel);
  } catch (err: any) {
    onError(err?.message || 'API is not available.');
    return;
  }

  const handleAbort = () => {
    options?.onAbort?.();
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: options?.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      onError(`Request failed: HTTP ${response.status} ${errText}`);
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      onError('Unable to read response stream.');
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      if (options?.signal?.aborted) {
        handleAbort();
        return;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parsed = parseSseBuffer(buffer, onChunk, onDone, onError);
      if (parsed.shouldStop) return;
      buffer = parsed.rest;
    }

    if (buffer.startsWith('data: ')) {
      const data = buffer.slice(6).trim();
      if (data && data !== '[DONE]') {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            onError(parsed.error);
            return;
          }
          if (parsed.text) onChunk(parsed.text);
        } catch {
          // Ignore tail parse failures
        }
      }
    }

    onDone();
  } catch (err) {
    if (isAbortError(err) || options?.signal?.aborted) {
      handleAbort();
      return;
    }
    onError(err instanceof Error ? err.message : 'Stream request failed.');
  }
}

export async function streamChat(
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
  options?: StreamOptions
): Promise<void> {
  const settings = getLLMSettings();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-chat-url': settings.baseUrl,
    'x-chat-key': settings.apiKey,
    'x-chat-model': settings.modelName,
    'x-chat-protocol': settings.protocol,
  };

  await streamViaSse(
    apiUrl('/api/llm/chat'),
    headers,
    {
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    },
    'AI chat',
    onChunk,
    onDone,
    onError,
    options
  );
}

export async function streamKnowledgeBaseChat(
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
  options?: StreamOptions
): Promise<void> {
  const settings = getLLMSettings();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-chat-url': settings.baseUrl,
    'x-chat-key': settings.apiKey,
    'x-chat-model': settings.modelName,
    'x-chat-protocol': settings.protocol,
    'x-embedding-url': settings.embeddingBaseUrl,
    'x-embedding-key': settings.embeddingApiKey,
    'x-embedding-model': settings.embeddingModelName,
  };

  await streamViaSse(
    apiUrl('/api/kb/chat'),
    headers,
    {
      messages: messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role,
          content: m.content,
        })),
    },
    'Knowledge Base chat',
    onChunk,
    onDone,
    onError,
    options
  );
}
