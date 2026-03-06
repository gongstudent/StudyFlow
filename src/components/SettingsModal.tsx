import { useState, useEffect } from 'react';
import { X, Save, Github, Server } from 'lucide-react';
import { getSettings, saveSettings } from '../lib/settings';
import type { AppSettings } from '../lib/settings';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave?: (settings: AppSettings) => void;
}

export default function SettingsModal({ isOpen, onClose, onSave }: SettingsModalProps) {
    const [settings, setSettings] = useState<AppSettings>({ aiProvider: 'ollama', githubToken: '' });

    useEffect(() => {
        if (isOpen) {
            setSettings(getSettings());
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSave = () => {
        saveSettings(settings);
        if (onSave) onSave(settings);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center fade-in">
            <div className="bg-[var(--color-bg-primary)] w-full max-w-md rounded-2xl shadow-xl border border-[var(--color-border)] overflow-hidden flex flex-col slide-up">
                {/* Header */}
                <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-bg-secondary)]">
                    <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">设置 / Settings</h2>
                    <button
                        onClick={onClose}
                        className="p-2 -mr-2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] rounded-lg hover:bg-[var(--color-bg-hover)] transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {/* AI Provider Selection */}
                    <div className="space-y-3">
                        <label className="block text-sm font-medium text-[var(--color-text-secondary)]">
                            AI 模型供应商 (AI Provider)
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => setSettings({ ...settings, aiProvider: 'ollama' })}
                                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${settings.aiProvider === 'ollama'
                                    ? 'border-[var(--color-accent-primary)] bg-[var(--color-accent-soft)] text-[var(--color-accent-primary)]'
                                    : 'border-[var(--color-border)] hover:border-[var(--color-text-tertiary)] text-[var(--color-text-secondary)]'
                                    }`}
                            >
                                <Server size={24} />
                                <span className="font-medium">Ollama (Local)</span>
                            </button>

                            <button
                                onClick={() => setSettings({ ...settings, aiProvider: 'github' })}
                                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${settings.aiProvider === 'github'
                                    ? 'border-[var(--color-accent-primary)] bg-[var(--color-accent-soft)] text-[var(--color-accent-primary)]'
                                    : 'border-[var(--color-border)] hover:border-[var(--color-text-tertiary)] text-[var(--color-text-secondary)]'
                                    }`}
                            >
                                <Github size={24} />
                                <span className="font-medium">GitHub Models</span>
                            </button>
                        </div>
                        {settings.aiProvider === 'github' && (
                            <p className="text-xs text-[var(--color-text-tertiary)] mt-2">
                                推荐给在线 Demo 用户使用。无须本地环境，完全运行在浏览器中。
                            </p>
                        )}
                        {settings.aiProvider === 'ollama' && (
                            <p className="text-xs text-[var(--color-text-tertiary)] mt-2">
                                推荐给使用桌面应用 (Electron) 的用户。完全免费且本地隐私保护。
                            </p>
                        )}
                    </div>

                    {/* GitHub Token Input */}
                    {settings.aiProvider === 'github' && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                            <label className="block text-sm font-medium text-[var(--color-text-secondary)]">
                                GitHub Personal Access Token
                            </label>
                            <input
                                type="password"
                                value={settings.githubToken}
                                onChange={(e) => setSettings({ ...settings, githubToken: e.target.value })}
                                placeholder="ghp_xxxxxxxxxxxx"
                                className="w-full px-4 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)] focus:border-transparent transition-all placeholder:text-[var(--color-text-tertiary)] text-[var(--color-text-primary)]"
                            />
                            <p className="text-xs text-[var(--color-text-tertiary)]">
                                获取您的免费 Token:🔗 <a href="https://github.com/settings/tokens/new" target="_blank" rel="noreferrer" className="text-[var(--color-accent-primary)] hover:underline">在此创建</a> (无需特殊权限勾选)
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)] flex justify-end">
                    <button
                        onClick={handleSave}
                        className="flex items-center gap-2 px-6 py-2.5 bg-[var(--color-accent-primary)] hover:bg-[var(--color-accent-hover)] text-white font-medium rounded-xl transition-colors"
                    >
                        <Save size={18} />
                        保存设置
                    </button>
                </div>
            </div>
        </div>
    );
}
