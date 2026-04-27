import { apiUrl, ensureApiAvailable } from './config';

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
    // Keep defaults empty to avoid vendor-specific residue.
    baseUrl: '',
    apiKey: '',
    modelName: '',
    protocol: 'chat',
    embeddingBaseUrl: '',
    embeddingApiKey: '',
    embeddingModelName: ''
};

const STORAGE_KEY = 'studyflow_llm_settings';
const LEGACY_DEFAULT_CHAT_MODEL = 'qwen2.5:7b';

function normalizeSettings(settings: Partial<LLMSettings> | null | undefined): LLMSettings {
    const merged = { ...DEFAULT_SETTINGS, ...(settings || {}) };
    return {
        baseUrl: String(merged.baseUrl || '').trim(),
        apiKey: String(merged.apiKey || '').trim(),
        modelName: String(merged.modelName || '').trim(),
        protocol: String(merged.protocol || 'chat') === 'legacy' ? 'legacy' : 'chat',
        embeddingBaseUrl: String(merged.embeddingBaseUrl || '').trim(),
        embeddingApiKey: String(merged.embeddingApiKey || '').trim(),
        embeddingModelName: String(merged.embeddingModelName || '').trim(),
    };
}

function shouldClearLegacyChatModel(parsed: Partial<LLMSettings>): boolean {
    return (
        String(parsed?.modelName || '').trim() === LEGACY_DEFAULT_CHAT_MODEL &&
        ['http://localhost:11434/v1', ''].includes(String(parsed?.baseUrl || '').trim()) &&
        String(parsed?.apiKey || '').trim() === '' &&
        String(parsed?.protocol || 'chat') === 'chat'
    );
}

function readLocalSettings(): Partial<LLMSettings> {
    if (typeof window === 'undefined') return {};
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (!data) return {};
        return JSON.parse(data);
    } catch (e) {
        console.error('Failed to parse LLM settings from localStorage:', e);
        return {};
    }
}

export const getLLMSettings = (): LLMSettings => {
    if (typeof window === 'undefined') return DEFAULT_SETTINGS;
    const parsed = readLocalSettings();
    if (shouldClearLegacyChatModel(parsed)) {
        parsed.modelName = '';
    }
    return normalizeSettings(parsed);
};

export const saveLLMSettings = (settings: LLMSettings): LLMSettings => {
    const normalized = normalizeSettings(settings);
    if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    }
    return normalized;
};

export const loadLLMSettingsFromServer = async (): Promise<LLMSettings> => {
    try {
        ensureApiAvailable('LLM settings');
        const response = await fetch(apiUrl('/api/settings/llm'));
        if (!response.ok) {
            return getLLMSettings();
        }
        const data = await response.json().catch(() => ({} as any));
        const settings = normalizeSettings(data?.settings || {});
        saveLLMSettings(settings);
        return settings;
    } catch {
        return getLLMSettings();
    }
};

export const saveLLMSettingsPersistent = async (settings: LLMSettings): Promise<LLMSettings> => {
    const normalized = saveLLMSettings(settings);
    try {
        ensureApiAvailable('LLM settings');
        const response = await fetch(apiUrl('/api/settings/llm'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settings: normalized }),
        });
        if (!response.ok) {
            return normalized;
        }
        const data = await response.json().catch(() => ({} as any));
        const persisted = normalizeSettings(data?.settings || normalized);
        saveLLMSettings(persisted);
        return persisted;
    } catch {
        return normalized;
    }
};

/**
 * 通用 LLM 请求函数
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
        ensureApiAvailable('AI completion');
        // IMPORTANT: Proxy through backend to avoid browser CORS on local endpoints.
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'x-chat-url': settings.baseUrl,
            'x-chat-key': settings.apiKey,
            'x-chat-model': settings.modelName,
            'x-chat-protocol': settings.protocol,
        };

        const response = await fetch(apiUrl('/api/llm/complete'), {
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
