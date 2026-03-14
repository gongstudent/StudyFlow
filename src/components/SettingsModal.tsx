import { useState, useEffect } from 'react';
import { X, Save, CheckCircle2, Loader2, Network, AlertCircle } from 'lucide-react';
import { getLLMSettings, saveLLMSettings, type LLMSettings } from '../lib/llm';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
    const [settings, setSettings] = useState<LLMSettings>({
        // Chat
        baseUrl: '',
        apiKey: '',
        modelName: '',
        protocol: 'chat',
        // Embedding
        embeddingBaseUrl: '',
        embeddingApiKey: '',
        embeddingModelName: ''
    });

    const [isSaved, setIsSaved] = useState(false);
    const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
    const [testMsg, setTestMsg] = useState('');
    const [activeTab, setActiveTab] = useState<'chat' | 'embedding'>('chat');

    // 初始化时回显配置
    useEffect(() => {
        if (isOpen) {
            setSettings(getLLMSettings());
            setIsSaved(false);
            setTestStatus('idle');
            setTestMsg('');
            setActiveTab('chat');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleChange = (field: keyof LLMSettings, value: string) => {
        setSettings(prev => ({ ...prev, [field]: value }));
        setIsSaved(false); // 修改后重置保存状态
        setTestStatus('idle');
        setTestMsg('');
    };

    const handleTestConnection = async () => {
        setTestStatus('testing');
        setTestMsg('正在连接...');
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);

            // IMPORTANT: Test via backend to avoid browser CORS on local endpoints
            const response = await fetch('/api/llm/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target: activeTab, settings }),
                signal: controller.signal
            }).finally(() => clearTimeout(timeoutId));

            const data = await response.json().catch(() => ({} as any));

            if (!response.ok || !data.ok) {
                if (response.status === 401) throw new Error('API Key 无效 (401)');
                if (response.status === 404) throw new Error('模型不存在或地址错误 (404)');
                throw new Error(data?.error || `HTTP 状态码: ${response.status}`);
            }

            setTestStatus('success');
            if (activeTab === 'chat') {
                setTestMsg('对话模型连通并且参数验证正常！');
            } else {
                const dim = typeof data?.dim === 'number' ? `，向量维度 ${data.dim}` : '';
                setTestMsg(`向量模型连通并且参数验证正常${dim}！`);
            }
        } catch (err: any) {
            setTestStatus('error');
            setTestMsg(`${err.name === 'AbortError' ? '请求超时 (请确认地址正确且服务已启动)' : err.message}`);
        }
    };

    const handleSave = () => {
        saveLLMSettings(settings);
        setIsSaved(true);
        // 1.5秒后隐藏保存成功提示
        setTimeout(() => setIsSaved(false), 1500);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className="w-[480px] bg-[var(--color-bg-primary)] rounded-2xl shadow-2xl border border-[var(--color-border-strong)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-divider)] bg-[var(--color-bg-secondary)]">
                    <h2 className="text-[16px] font-bold text-[var(--color-text-primary)]">大模型自定义设置</h2>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-5 flex flex-col gap-4">

                    {/* Tabs */}
                    <div className="flex bg-[var(--color-bg-input)] p-1 rounded-lg">
                        <button
                            className={`flex-1 py-1.5 text-[14px] font-medium rounded-md transition-colors ${activeTab === 'chat' ? 'bg-[var(--color-bg-card)] text-[var(--color-accent-primary)] shadow-sm' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'}`}
                            onClick={() => setActiveTab('chat')}
                        >
                            对话大模型 (Chat LLM)
                        </button>
                        <button
                            className={`flex-1 py-1.5 text-[14px] font-medium rounded-md transition-colors ${activeTab === 'embedding' ? 'bg-[var(--color-bg-card)] text-[var(--color-accent-primary)] shadow-sm' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'}`}
                            onClick={() => setActiveTab('embedding')}
                        >
                            向量模型 (Embedding)
                        </button>
                    </div>

                    {activeTab === 'chat' && (
                        <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-left-2 duration-300">
                            {/* Base URL */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[14px] font-semibold text-[var(--color-text-secondary)]">
                                    API 接口地址 (Base URL)
                                </label>
                                <input
                                    type="text"
                                    value={settings.baseUrl}
                                    onChange={e => handleChange('baseUrl', e.target.value)}
                                    placeholder="例如: https://api.openai.com/v1 或本地 Ollama 地址"
                                    className="w-full h-10 px-3 bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-lg text-[15px] text-[var(--color-text-primary)] focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)] outline-none transition-all placeholder:text-[var(--color-text-tertiary)]"
                                />
                            </div>

                            {/* API Key */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[14px] font-semibold text-[var(--color-text-secondary)]">
                                    API Key
                                </label>
                                <input
                                    type="password"
                                    value={settings.apiKey}
                                    onChange={e => handleChange('apiKey', e.target.value)}
                                    placeholder="sk-..."
                                    className="w-full h-10 px-3 bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-lg text-[15px] text-[var(--color-text-primary)] focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)] outline-none transition-all placeholder:text-[var(--color-text-tertiary)] font-mono"
                                />
                            </div>

                            {/* Model Name */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[14px] font-semibold text-[var(--color-text-secondary)]">
                                    模型名称 (Model Name)
                                </label>
                                <input
                                    type="text"
                                    value={settings.modelName}
                                    onChange={e => handleChange('modelName', e.target.value)}
                                    placeholder="例如: gpt-4o, deepseek-chat, qwen2.5:7b"
                                    className="w-full h-10 px-3 bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-lg text-[15px] text-[var(--color-text-primary)] focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)] outline-none transition-all placeholder:text-[var(--color-text-tertiary)] font-mono"
                                />
                            </div>

                        </div>
                    )}

                    {activeTab === 'embedding' && (
                        <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-2 duration-300">
                            <div className="px-3 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg text-sm mb-1">
                                向量模型用于本地知识库 RAG (Retrieval-Augmented Generation)，负责将文档切片转成多维向量。
                            </div>

                            {/* Base URL */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[14px] font-semibold text-[var(--color-text-secondary)]">
                                    API 接口地址 (Base URL)
                                </label>
                                <input
                                    type="text"
                                    value={settings.embeddingBaseUrl}
                                    onChange={e => handleChange('embeddingBaseUrl', e.target.value)}
                                    placeholder="例如: https://api.openai.com/v1 或本地 Ollama地址"
                                    className="w-full h-10 px-3 bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-lg text-[15px] text-[var(--color-text-primary)] focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)] outline-none transition-all placeholder:text-[var(--color-text-tertiary)]"
                                />
                            </div>

                            {/* API Key */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[14px] font-semibold text-[var(--color-text-secondary)]">
                                    API Key
                                </label>
                                <input
                                    type="password"
                                    value={settings.embeddingApiKey}
                                    onChange={e => handleChange('embeddingApiKey', e.target.value)}
                                    placeholder="sk-..."
                                    className="w-full h-10 px-3 bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-lg text-[15px] text-[var(--color-text-primary)] focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)] outline-none transition-all placeholder:text-[var(--color-text-tertiary)] font-mono"
                                />
                            </div>

                            {/* Model Name */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[14px] font-semibold text-[var(--color-text-secondary)]">
                                    向量模型名称 (Model Name)
                                </label>
                                <input
                                    type="text"
                                    value={settings.embeddingModelName}
                                    onChange={e => handleChange('embeddingModelName', e.target.value)}
                                    placeholder="例如: text-embedding-ada-002, nomic-embed-text"
                                    className="w-full h-10 px-3 bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-lg text-[15px] text-[var(--color-text-primary)] focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)] outline-none transition-all placeholder:text-[var(--color-text-tertiary)] font-mono"
                                />
                            </div>
                        </div>
                    )}

                </div>

                {/* Footer 与测试信息区 */}
                <div className="flex flex-col border-t border-[var(--color-border-divider)] bg-[var(--color-bg-secondary)]">

                    {/* 测试结果详情展示区 (单独占一行，如果存在的话) */}
                    {testStatus === 'error' && (
                        <div className="px-6 pt-3 pb-1">
                            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400">
                                <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
                                <div className="text-[12px] font-medium leading-relaxed break-all">
                                    测试失败: {testMsg}
                                </div>
                            </div>
                        </div>
                    )}
                    {testStatus === 'success' && (
                        <div className="px-6 pt-3 pb-1">
                            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 text-green-600 dark:text-green-500">
                                <CheckCircle2 size={15} className="flex-shrink-0" />
                                <div className="text-[12px] font-medium leading-relaxed">
                                    {testMsg}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex items-center justify-between px-6 py-4 gap-3">
                        {/* 左侧：测试连通性按钮 */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleTestConnection}
                                disabled={
                                    testStatus === 'testing' ||
                                    (activeTab === 'chat'
                                        ? (!settings.baseUrl || !settings.modelName)
                                        : (!settings.embeddingBaseUrl || !settings.embeddingModelName))
                                }
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-[var(--color-text-secondary)] border border-[var(--color-border-default)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)] bg-white dark:bg-[#202020] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hidden sm:flex"
                            >
                                {testStatus === 'testing' ? (
                                    <Loader2 size={13} className="animate-spin" />
                                ) : (
                                    <Network size={13} />
                                )}
                                测试连接
                            </button>
                        </div>

                        {/* 右侧：保存功能 */}
                        <div className="flex items-center gap-3">
                            {isSaved && (
                                <div className="flex items-center gap-1 text-green-600 dark:text-green-500 animate-in slide-in-from-left-2 fade-in duration-300">
                                    <span className="text-[12px] font-medium">配置已保存</span>
                                </div>
                            )}
                            <button
                                onClick={onClose}
                                className="px-4 py-1.5 rounded-lg text-[13px] font-medium text-[var(--color-text-secondary)] bg-[var(--color-bg-input)] border border-[var(--color-border-default)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)] transition-all cursor-pointer"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleSave}
                                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-medium bg-[var(--color-accent-primary)] text-white hover:bg-[var(--color-accent-hover)] transition-all cursor-pointer shadow-sm border border-transparent"
                            >
                                <Save size={14} />
                                保存配置
                            </button>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
