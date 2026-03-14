import type { ChatMessage } from '../types';
import { getLLMSettings } from './llm';

/**
 * 流式发送聊天消息到大模型，逐 chunk 回调
 */
export async function streamChat(
    messages: ChatMessage[],
    onChunk: (text: string) => void,
    onDone: () => void,
    onError: (error: string) => void
): Promise<void> {
    const settings = getLLMSettings();

    try {
        // IMPORTANT: Browsers will block cross-origin calls to local LLM endpoints (CORS).
        // We proxy the request through our backend (scraper.mjs) to avoid CORS issues.
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'x-chat-url': settings.baseUrl,
            'x-chat-key': settings.apiKey,
            'x-chat-model': settings.modelName,
            'x-chat-protocol': settings.protocol,
        };

        const response = await fetch('/api/llm/chat', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                messages: messages.map((m) => ({
                    role: m.role,
                    content: m.content,
                }))
            }),
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            if (response.status === 401) {
                onError('API 鉴权失败，请检查"设置"中的 API Key 配置。');
            } else {
                onError(`请求失败: HTTP ${response.status} ${errText}`);
            }
            return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
            onError('无法读取响应流');
            return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.trim() === '') continue;
                if (line.startsWith('data: ')) {
                    const data = line.slice(6).trim();

                    if (data === '[DONE]') {
                        onDone();
                        return;
                    }

                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.error) {
                            onError(parsed.error);
                            return;
                        }
                        if (parsed.text) {
                            onChunk(parsed.text);
                        }
                    } catch {
                        // ignore broken json chunks
                    }
                }
            }
        }

        if (buffer.startsWith('data: ')) {
            const data = buffer.slice(6).trim();
            if (data && data !== '[DONE]') {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.error) {
                        onError(parsed.error);
                    } else if (parsed.text) {
                        onChunk(parsed.text);
                    }
                } catch {
                    // ignore
                }
            }
        }

        onDone();
    } catch (err) {
        onError(err instanceof Error ? err.message : 'AI 请求失败');
    }
}

/**
 * 流式发送聊天消息到本地 RAG Knowledge Base 接口
 */
export async function streamKnowledgeBaseChat(
    messages: ChatMessage[],
    onChunk: (text: string) => void,
    onDone: () => void,
    onError: (error: string) => void
): Promise<void> {
    const settings = getLLMSettings();

    try {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'x-chat-url': settings.baseUrl,
            'x-chat-key': settings.apiKey,
            'x-chat-model': settings.modelName,
            'x-chat-protocol': settings.protocol,
            'x-embedding-url': settings.embeddingBaseUrl,
            'x-embedding-key': settings.embeddingApiKey,
            'x-embedding-model': settings.embeddingModelName
        };

        const response = await fetch('/api/kb/chat', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                messages: messages
                    .filter(m => m.role !== 'system') // Filter out conflicting frontend system prompts (like current article context)
                    .map((m) => ({
                        role: m.role,
                        content: m.content,
                    }))
            }),
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            onError(`Knowledge Base 请求失败: HTTP ${response.status} - ${errText}`);
            return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
            onError('无法读取响应流');
            return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.trim() === '') continue;
                if (line.startsWith('data: ')) {
                    const data = line.slice(6).trim();

                    if (data === '[DONE]') {
                        onDone();
                        return;
                    }

                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.error) {
                            onError(parsed.error);
                            return;
                        }
                        if (parsed.text) {
                            onChunk(parsed.text);
                        }
                    } catch {
                        // ignore broken json chunks
                    }
                }
            }
        }

        if (buffer.startsWith('data: ')) {
            const data = buffer.slice(6).trim();
            if (data && data !== '[DONE]') {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.error) {
                        onError(parsed.error);
                    } else if (parsed.text) {
                        onChunk(parsed.text);
                    }
                } catch {
                    // ignore
                }
            }
        }

        onDone();
    } catch (err) {
        console.error('KB Chat Stream Error:', err);
        onError(err instanceof Error ? err.message : 'Knowledge Base 访问失败');
    }
}
