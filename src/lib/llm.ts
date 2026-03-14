export interface LLMSettings {
    // Chat LLM Config
    baseUrl: string;
    apiKey: string;
    modelName: string;
    protocol: 'chat' | 'legacy';

    // Embedding Model Config
    embeddingBaseUrl: string;
    embeddingApiKey: string;
    embeddingModelName: string;
}

const DEFAULT_SETTINGS: LLMSettings = {
    // 默认 Chat 模型适配 Ollama 的 OpenAI 兼容接口，或是真正的 OpenAI
    baseUrl: 'http://localhost:11434/v1',
    apiKey: '',
    modelName: 'qwen2.5:7b',
    protocol: 'chat',

    // 默认 Embedding 模型适配 Ollama 的 nomic-embed-text
    embeddingBaseUrl: 'http://localhost:11434/v1',
    embeddingApiKey: '',
    embeddingModelName: 'nomic-embed-text'
};

const STORAGE_KEY = 'studyflow_llm_settings';

export const getLLMSettings = (): LLMSettings => {
    if (typeof window === 'undefined') return DEFAULT_SETTINGS;
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (data) {
            const parsed = JSON.parse(data);
            // Merge with defaults to ensure newer fields exist (backwards compatibility)
            return { ...DEFAULT_SETTINGS, ...parsed };
        }
    } catch (e) {
        console.error('Failed to parse LLM settings from localStorage:', e);
    }
    return DEFAULT_SETTINGS;
};

export const saveLLMSettings = (settings: LLMSettings) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
};

/**
 * 通用的 LLM 请求函数
 * 自动读取 localStorage 里的配置组装请求头和 Body
 * @param promptTextOrMessages 提示词文本，或完整消息数组 {role, content}[]
 * @returns 模型返回的纯文本字符串
 */
export const fetchLLMResponse = async (
    promptTextOrMessages: string | { role: string, content: string }[]
): Promise<string> => {
    const settings = getLLMSettings();

    let messages: { role: string, content: string }[] = [];
    if (typeof promptTextOrMessages === 'string') {
        messages = [{ role: 'user', content: promptTextOrMessages }];
    } else {
        messages = promptTextOrMessages;
    }

    try {
        // IMPORTANT: Proxy through backend to avoid browser CORS on local endpoints.
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'x-chat-url': settings.baseUrl,
            'x-chat-key': settings.apiKey,
            'x-chat-model': settings.modelName,
            'x-chat-protocol': settings.protocol,
        };

        const response = await fetch('/api/llm/complete', {
            method: 'POST',
            headers,
            body: JSON.stringify({ messages })
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({} as any));
            if (response.status === 401) {
                throw new Error('API 鉴权失败 (401)，请检查 API Key 是否正确');
            }
            throw new Error(data?.error || `请求失败: HTTP ${response.status} - ${response.statusText}`);
        }

        const data = await response.json().catch(() => ({} as any));
        return data?.content || '';
    } catch (error) {
        console.error('fetchLLMResponse Error:', error);
        throw error;
    }
};
