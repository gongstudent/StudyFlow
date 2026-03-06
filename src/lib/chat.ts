import type { ChatMessage } from '../types';

import { API_BASE_URL } from './config';

const CHAT_API_URL = `${API_BASE_URL}/api/chat`;

/**
 * 流式发送聊天消息到后端，逐 chunk 回调
 *
 * @param messages - 完整消息历史（含 system prompt）
 * @param onChunk  - 每收到一段文本就调用
 * @param onDone   - 流结束后调用
 * @param onError  - 出错时调用
 */
export async function streamChat(
    messages: ChatMessage[],
    onChunk: (text: string) => void,
    onDone: () => void,
    onError: (error: string) => void
): Promise<void> {
    try {
        const response = await fetch(CHAT_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: messages.map((m) => ({
                    role: m.role,
                    content: m.content,
                })),
            }),
        });

        if (!response.ok) {
            onError(`请求失败: HTTP ${response.status}`);
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
            buffer = lines.pop() || ''; // 保留不完整行

            for (const line of lines) {
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
                        // 解析失败，跳过
                    }
                }
            }
        }

        // 处理 buffer 中残留的数据
        if (buffer.startsWith('data: ')) {
            const data = buffer.slice(6).trim();
            if (data && data !== '[DONE]') {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.text) {
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
