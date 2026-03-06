import { useState } from 'react';
import { API_BASE_URL } from '../lib/config';
import { getSettings } from '../lib/settings';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { X, FileText, BookOpen, Loader2, Copy, Check, Sparkles } from 'lucide-react';

type DraftType = 'blog' | 'summary';

interface WriterModalProps {
    articleContent: string;
    onClose: () => void;
}

export default function WriterModal({ articleContent, onClose }: WriterModalProps) {
    const [draftType, setDraftType] = useState<DraftType>('blog');
    const [result, setResult] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const handleGenerate = async (type: DraftType) => {
        setDraftType(type);
        setIsLoading(true);
        setError(null);
        setResult(null);
        try {
            const settings = getSettings();
            const isGithub = settings.aiProvider === 'github';

            if (isGithub && !settings.githubToken) {
                throw new Error('请先在"设置"中配置 GitHub Personal Access Token');
            }

            if (isGithub) {
                const systemPrompt = type === 'blog'
                    ? 'You are an expert technical writer. Write a comprehensive, well-structured tech blog post based on the provided text. Use markdown.'
                    : 'You are an expert summarizer. Write a concise, bulleted summary of the provided text. Use markdown.';

                const resp = await fetch('https://models.inference.ai.azure.com/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${settings.githubToken}`
                    },
                    body: JSON.stringify({
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: articleContent }
                        ],
                        model: 'gpt-4o-mini',
                        temperature: 0.5
                    })
                });

                if (!resp.ok) {
                    const errText = await resp.text().catch(() => '');
                    if (resp.status === 401) throw new Error('GitHub Token 无效或已过期');
                    throw new Error(`请求失败 (${resp.status}): ${errText}`);
                }
                const data = await resp.json();
                setResult(data.choices?.[0]?.message?.content || '');
            } else {
                const resp = await fetch(`${API_BASE_URL}/api/generate-draft`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: articleContent, type }),
                });
                if (!resp.ok) {
                    const data = await resp.json().catch(() => ({}));
                    throw new Error(data.error || `请求失败 (${resp.status})`);
                }
                const data = await resp.json();
                setResult(data.draft);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : '生成失败');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCopy = async () => {
        if (!result) return;
        await navigator.clipboard.writeText(result);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,.45)', backdropFilter: 'blur(4px)' }}
            onClick={onClose}
        >
            <div
                className="relative flex flex-col w-[680px] max-h-[85vh] rounded-2xl shadow-2xl overflow-hidden"
                style={{ backgroundColor: 'var(--color-bg-primary)', border: '1px solid var(--color-border-default)' }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--color-border-default)' }}>
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}>
                            <Sparkles size={16} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-[15px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>AI 写作助手</h2>
                            <p className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>基于当前文章内容生成草稿</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg cursor-pointer transition-colors"
                        style={{ color: 'var(--color-text-tertiary)' }}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Type Selector */}
                <div className="px-6 py-4 flex gap-3">
                    <TypeCard
                        icon={<FileText size={18} />}
                        title="生成技术博客"
                        desc="幽默风趣的技术分享文章"
                        active={draftType === 'blog' && (isLoading || !!result)}
                        loading={isLoading && draftType === 'blog'}
                        gradient="linear-gradient(135deg, #3b82f6, #8b5cf6)"
                        onClick={() => handleGenerate('blog')}
                    />
                    <TypeCard
                        icon={<BookOpen size={18} />}
                        title="生成学习笔记"
                        desc="结构化的阅读笔记 & 要点"
                        active={draftType === 'summary' && (isLoading || !!result)}
                        loading={isLoading && draftType === 'summary'}
                        gradient="linear-gradient(135deg, #14b8a6, #3b82f6)"
                        onClick={() => handleGenerate('summary')}
                    />
                </div>

                {/* Result Area */}
                {(isLoading || result || error) && (
                    <div className="flex-1 overflow-y-auto px-6 pb-4 min-h-0">
                        {isLoading && (
                            <div className="flex flex-col items-center justify-center py-16 gap-3">
                                <Loader2 size={28} className="animate-spin" style={{ color: 'var(--color-accent-primary)' }} />
                                <p className="text-[13px]" style={{ color: 'var(--color-text-tertiary)' }}>
                                    AI 正在{draftType === 'blog' ? '撰写博客' : '整理笔记'}...
                                </p>
                            </div>
                        )}
                        {error && (
                            <div className="px-4 py-3 rounded-lg text-[13px]" style={{ backgroundColor: '#fef2f2', color: '#dc2626' }}>
                                {error}
                            </div>
                        )}
                        {result && (
                            <div className="rounded-xl p-5 text-[14px] leading-relaxed" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {result}
                                </ReactMarkdown>
                            </div>
                        )}
                    </div>
                )}

                {/* Footer with Copy */}
                {result && (
                    <div className="flex items-center justify-end gap-2 px-6 py-3 border-t" style={{ borderColor: 'var(--color-border-default)' }}>
                        <button
                            onClick={handleCopy}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium cursor-pointer transition-all"
                            style={
                                copied
                                    ? { backgroundColor: '#dcfce7', color: '#16a34a' }
                                    : { backgroundColor: 'var(--color-accent-primary)', color: '#fff' }
                            }
                        >
                            {copied ? <Check size={14} /> : <Copy size={14} />}
                            {copied ? '已复制' : '复制到剪贴板'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

/* ===== 类型选择卡片 ===== */
function TypeCard({
    icon,
    title,
    desc,
    active,
    loading,
    gradient,
    onClick,
}: {
    icon: React.ReactNode;
    title: string;
    desc: string;
    active: boolean;
    loading: boolean;
    gradient: string;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            disabled={loading}
            className="flex-1 flex items-center gap-3 px-4 py-3.5 rounded-xl text-left cursor-pointer transition-all disabled:cursor-wait"
            style={{
                border: active ? '2px solid transparent' : '2px solid var(--color-border-default)',
                background: active ? gradient : 'var(--color-bg-secondary)',
                color: active ? '#fff' : 'var(--color-text-primary)',
                boxShadow: active ? '0 4px 12px rgba(0,0,0,.15)' : 'none',
            }}
        >
            <div
                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{
                    backgroundColor: active ? 'rgba(255,255,255,.2)' : 'var(--color-bg-tertiary)',
                    color: active ? '#fff' : 'var(--color-text-secondary)',
                }}
            >
                {loading ? <Loader2 size={18} className="animate-spin" /> : icon}
            </div>
            <div>
                <p className="text-[13px] font-semibold">{title}</p>
                <p className="text-[11px] mt-0.5" style={{ opacity: active ? 0.85 : 0.6 }}>{desc}</p>
            </div>
        </button>
    );
}
