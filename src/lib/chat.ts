import type { ChatMessage } from '../types';

import { API_BASE_URL } from './config';
import { getSettings } from './settings';

const CHAT_API_URL = `${API_BASE_URL}/api/chat`;
const GITHUB_MODELS_URL = 'https://models.inference.ai.azure.com/chat/completions';

/**
 * 流式发送聊天消息到后端或 GitHub Models，逐 chunk 回调
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
    const settings = getSettings();
    const isGithub = settings.aiProvider === 'github';

    if (isGithub && !settings.githubToken) {
        onError('请先在"设置"中配置 GitHub Personal Access Token');
        return;
    }

    try {
        const url = isGithub ? GITHUB_MODELS_URL : CHAT_API_URL;
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (isGithub) {
            headers['Authorization'] = `Bearer ${settings.githubToken}`;
        }

        const body = isGithub
            ? JSON.stringify({
                messages: messages.map((m) => ({
                    role: m.role,
                    content: m.content,
                })),
                model: 'gpt-4o-mini',
                stream: true,
            })
            : JSON.stringify({
                messages: messages.map((m) => ({
                    role: m.role,
                    content: m.content,
                })),
            });

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body,
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            if (isGithub && response.status === 401) {
                onError('GitHub Token 无效或已过期，请检查"设置"中的配置。');
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
            buffer = lines.pop() || ''; // 保留不完整行

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
                        if (isGithub) {
                            // GitHub Models (OpenAI format) SSE chunk
                            if (parsed.choices?.[0]?.delta?.content) {
                                onChunk(parsed.choices[0].delta.content);
                            }
                        } else {
                            // Local Express Proxy SSE chunk format
                            if (parsed.error) {
                                onError(parsed.error);
                                return;
                            }
                            if (parsed.text) {
                                onChunk(parsed.text);
                            }
                        }
                    } catch {
                        // 解析失败，跳过 (可能是中途截断的 JSON 等)
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
                    if (isGithub && parsed.choices?.[0]?.delta?.content) {
                        onChunk(parsed.choices[0].delta.content);
                    } else if (!isGithub && parsed.text) {
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
