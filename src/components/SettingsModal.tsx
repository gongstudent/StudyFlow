import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Network, Save, X } from 'lucide-react';
import {
  getLLMSettings,
  loadLLMSettingsFromServer,
  saveLLMSettingsPersistent,
  type LLMSettings,
} from '../lib/llm';
import { apiUrl, ensureApiAvailable } from '../lib/config';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TestStatus = 'idle' | 'testing' | 'success' | 'error';

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState<LLMSettings>({
    baseUrl: '',
    apiKey: '',
    modelName: '',
    protocol: 'chat',
    embeddingBaseUrl: '',
    embeddingApiKey: '',
    embeddingModelName: '',
  });
  const [activeTab, setActiveTab] = useState<'chat' | 'embedding'>('chat');
  const [isSaved, setIsSaved] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testMsg, setTestMsg] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setSettings(getLLMSettings());
    setActiveTab('chat');
    setIsSaved(false);
    setTestStatus('idle');
    setTestMsg('');

    let active = true;
    loadLLMSettingsFromServer()
      .then((serverSettings) => {
        if (active) setSettings(serverSettings);
      })
      .catch(() => {
        // keep local fallback
      });

    return () => {
      active = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChange = (field: keyof LLMSettings, value: string) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
    setIsSaved(false);
    setTestStatus('idle');
    setTestMsg('');
  };

  const handleTestConnection = async () => {
    const isChat = activeTab === 'chat';
    const requiredBaseUrl = isChat ? settings.baseUrl : settings.embeddingBaseUrl;
    const requiredModel = isChat ? settings.modelName : settings.embeddingModelName;

    if (!requiredBaseUrl.trim()) {
      setTestStatus('error');
      setTestMsg('请先填写 API 接口地址');
      return;
    }
    if (!requiredModel.trim()) {
      setTestStatus('error');
      setTestMsg('请先填写模型名称');
      return;
    }

    setTestStatus('testing');
    setTestMsg(isChat ? '正在测试对话模型连接...' : '正在测试向量模型连接...');

    try {
      ensureApiAvailable('LLM test');
      const response = await fetch(apiUrl('/api/llm/test'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: isChat ? 'chat' : 'embedding',
          settings,
        }),
      });

      const data = await response.json().catch(() => ({} as any));
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${response.status}`);
      }

      if (isChat && data.warning === 'STREAMING_RESPONSE') {
        setTestStatus('success');
        setTestMsg('连接成功。当前网关返回流式响应（SSE），已兼容。');
        return;
      }

      if (isChat && data.warning === 'MODEL_NOT_FOUND') {
        const suggestedModel = String(data?.suggestedModel || '').trim();
        if (suggestedModel && suggestedModel !== settings.modelName) {
          setSettings((prev) => ({ ...prev, modelName: suggestedModel }));
          setTestMsg(`连接成功，但模型 "${settings.modelName}" 不存在。已建议改为 "${suggestedModel}"，请点击保存配置。`);
        } else if (Array.isArray(data?.availableModels) && data.availableModels.length > 0) {
          setTestMsg(`连接成功，但当前模型不存在。可用模型：${data.availableModels.slice(0, 5).join(', ')}`);
        } else {
          setTestMsg(`连接成功，但模型 "${settings.modelName}" 不存在。请在你的模型服务中确认该模型已可用。`);
        }
        setTestStatus('success');
        return;
      }

      if (isChat) {
        setTestStatus('success');
        setTestMsg('对话模型连接与参数校验通过。');
      } else {
        const dim = Number(data?.dim || 0);
        setTestStatus('success');
        setTestMsg(dim > 0 ? `向量模型连接通过，向量维度 ${dim}。` : '向量模型连接与参数校验通过。');
      }
    } catch (err: any) {
      const message = String(err?.message || '');
      setTestStatus('error');
      if (message.includes('404')) {
        setTestMsg('接口地址或模型不存在（404），请检查 Base URL 与模型名称。');
      } else if (message.includes('fetch failed') || message.includes('Failed to fetch')) {
        setTestMsg('连接失败，请检查后端服务是否运行以及网络连通性。');
      } else {
        setTestMsg(message || '连接测试失败');
      }
    }
  };

  const handleSave = async () => {
    const saved = await saveLLMSettingsPersistent(settings);
    setSettings(saved);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 1500);
  };

  const isTestDisabled =
    testStatus === 'testing' ||
    (activeTab === 'chat'
      ? !settings.baseUrl.trim() || !settings.modelName.trim()
      : !settings.embeddingBaseUrl.trim() || !settings.embeddingModelName.trim());

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <div className="w-[500px] max-w-[calc(100vw-1.5rem)] max-h-[88vh] my-auto bg-[var(--color-bg-primary)] rounded-none shadow-2xl border border-[var(--color-border-strong)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-divider)] bg-[var(--color-bg-secondary)]">
          <h2 className="text-[16px] font-bold text-[var(--color-text-primary)]">大模型自定义设置</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-none text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4 overflow-y-auto">
          <div className="flex bg-[var(--color-bg-input)] p-1.5 rounded-none">
            <button
              className={`flex-1 py-2 text-[14px] font-medium rounded-none transition-colors ${
                activeTab === 'chat'
                  ? 'bg-[var(--color-bg-card)] text-[var(--color-accent-primary)] shadow-sm'
                  : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'
              }`}
              onClick={() => setActiveTab('chat')}
            >
              对话模型 (Chat LLM)
            </button>
            <button
              className={`flex-1 py-2 text-[14px] font-medium rounded-none transition-colors ${
                activeTab === 'embedding'
                  ? 'bg-[var(--color-bg-card)] text-[var(--color-accent-primary)] shadow-sm'
                  : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'
              }`}
              onClick={() => setActiveTab('embedding')}
            >
              向量模型 (Embedding)
            </button>
          </div>

          {activeTab === 'chat' ? (
            <div className="flex flex-col gap-4">
              <Field
                label="API 接口地址 (Base URL)"
                value={settings.baseUrl}
                placeholder="例如: https://api.openai.com/v1 或你的模型服务地址"
                onChange={(value) => handleChange('baseUrl', value)}
              />
              <Field
                label="API Key"
                type="password"
                value={settings.apiKey}
                placeholder="sk-..."
                onChange={(value) => handleChange('apiKey', value)}
              />
              <Field
                label="模型名称 (Model Name)"
                value={settings.modelName}
                placeholder="例如: gpt-4o-mini / kimi-k2 / 你的本地模型"
                onChange={(value) => handleChange('modelName', value)}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="px-3.5 py-2.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-none text-sm">
                向量模型用于知识库检索（RAG），请确保该模型支持 embedding 输出。
              </div>
              <Field
                label="API 接口地址 (Base URL)"
                value={settings.embeddingBaseUrl}
                placeholder="例如: https://api.openai.com/v1 或你的向量服务地址"
                onChange={(value) => handleChange('embeddingBaseUrl', value)}
              />
              <Field
                label="API Key"
                type="password"
                value={settings.embeddingApiKey}
                placeholder="sk-..."
                onChange={(value) => handleChange('embeddingApiKey', value)}
              />
              <Field
                label="向量模型名称 (Model Name)"
                value={settings.embeddingModelName}
                placeholder="例如: text-embedding-3-small 或你的向量模型"
                onChange={(value) => handleChange('embeddingModelName', value)}
              />
            </div>
          )}
        </div>

        <div className="flex flex-col shrink-0 border-t border-[var(--color-border-divider)] bg-[var(--color-bg-secondary)]">
          {testStatus === 'error' && <StatusBox tone="error" message={`测试失败: ${testMsg}`} />}
          {testStatus === 'success' && <StatusBox tone="success" message={testMsg} />}

          <div className="flex items-center justify-between px-6 py-4 gap-3 flex-wrap">
            <button
              onClick={handleTestConnection}
              disabled={isTestDisabled}
              className="h-9 shrink-0 flex items-center gap-1.5 px-4 rounded-none text-[12px] font-medium text-[var(--color-text-secondary)] border border-[var(--color-border-default)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)] bg-white dark:bg-[#202020] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testStatus === 'testing' ? <Loader2 size={13} className="animate-spin" /> : <Network size={13} />}
              测试连接
            </button>

            <div className="flex items-center justify-end gap-2 sm:gap-3 flex-wrap min-w-0">
              {isSaved && (
                <div className="flex items-center gap-1 text-green-600 dark:text-green-500 animate-in slide-in-from-left-2 fade-in duration-300">
                  <span className="text-[12px] font-medium">配置已保存</span>
                </div>
              )}
              <button
                onClick={onClose}
                className="h-9 shrink-0 px-5 rounded-none text-[13px] leading-none font-medium text-[var(--color-text-secondary)] bg-[var(--color-bg-input)] border border-[var(--color-border-default)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)] transition-all cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                className="h-9 shrink-0 flex items-center gap-1.5 px-5 rounded-none text-[13px] leading-none font-medium bg-[var(--color-accent-primary)] text-white hover:bg-[var(--color-accent-hover)] transition-all cursor-pointer shadow-sm border border-transparent"
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

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'password';
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[14px] font-semibold text-[var(--color-text-secondary)]">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-11 px-4 bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-none text-[15px] text-[var(--color-text-primary)] focus:border-[var(--color-accent-primary)] focus:ring-1 focus:ring-[var(--color-accent-primary)] outline-none transition-all placeholder:text-[var(--color-text-tertiary)]"
      />
    </div>
  );
}

function StatusBox({ tone, message }: { tone: 'success' | 'error'; message: string }) {
  const isSuccess = tone === 'success';
  return (
    <div className="px-6 pt-3 pb-1">
      <div
        className={`flex items-start gap-2 p-3 rounded-none border ${
          isSuccess
            ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900 text-green-600 dark:text-green-400'
            : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900 text-red-600 dark:text-red-400'
        }`}
      >
        {isSuccess ? (
          <CheckCircle2 size={15} className="mt-0.5 flex-shrink-0" />
        ) : (
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
        )}
        <div className="text-[12px] font-medium leading-relaxed break-all">{message}</div>
      </div>
    </div>
  );
}
