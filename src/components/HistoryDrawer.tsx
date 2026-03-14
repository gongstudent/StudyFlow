import { useState, useMemo, memo } from 'react';
import { Clock, ExternalLink, Trash2, Database, FolderOpen, List, Hash, ChevronRight, Flame, X, History } from 'lucide-react';
import { ActivityCalendar } from 'react-activity-calendar';
import type { Article } from '../types';

/* ===== 动态标签配色 ===== */
const TAG_COLORS = [
    { bg: '#eff6ff', text: '#1e40af', accent: '#3b82f6', border: '#bfdbfe' }, // blue
    { bg: '#f0fdf4', text: '#166534', accent: '#22c55e', border: '#bbf7d0' }, // green
    { bg: '#faf5ff', text: '#6b21a8', accent: '#a855f7', border: '#e9d5ff' }, // purple
    { bg: '#fff7ed', text: '#9a3412', accent: '#f97316', border: '#fed7aa' }, // orange
    { bg: '#fdf2f8', text: '#9d174d', accent: '#ec4899', border: '#fbcfe8' }, // pink
    { bg: '#f0fdfa', text: '#115e59', accent: '#14b8a6', border: '#99f6e4' }, // teal
    { bg: '#fffbeb', text: '#92400e', accent: '#f59e0b', border: '#fde68a' }, // amber
];
const UNCATEGORIZED_COLOR = { bg: '#f8fafc', text: '#475569', accent: '#94a3b8', border: '#e2e8f0' };

function getTagColor(tag: string) {
    if (tag === '未分类') return UNCATEGORIZED_COLOR;
    let hash = 0;
    for (let i = 0; i < tag.length; i++) {
        hash = ((hash << 5) - hash + tag.charCodeAt(i)) | 0;
    }
    return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

/* ===== 单篇文章条目 - Memoized ===== */
const ArticleItem = memo(function ArticleItem({
    article,
    onLoadArticle,
    onDeleteArticle,
    onAddToKB,
    compact = false,
}: {
    article: Article;
    onLoadArticle: (article: Article) => void;
    onDeleteArticle: (id: string) => void;
    onAddToKB: (article: Article) => void;
    compact?: boolean;
}) {
    return (
        <div
            className={`group flex items-start gap-3 px-3 ${compact ? 'py-2' : 'py-3'} rounded-xl hover:bg-[var(--color-bg-hover)] cursor-pointer transition-colors`}
            onClick={() => onLoadArticle(article)}
        >
            {!compact && (
                <div className="w-8 h-8 rounded-lg bg-[var(--color-bg-input)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <ExternalLink size={14} className="text-[var(--color-text-tertiary)]" />
                </div>
            )}
            <div className="flex-1 min-w-0">
                <p className={`${compact ? 'text-[12.5px]' : 'text-[14px]'} font-semibold text-[var(--color-text-primary)] truncate`}>
                    {article.title}
                </p>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap text-[11px] text-[var(--color-text-tertiary)] font-medium">
                    <Clock size={11} />
                    <span>{new Date(article.fetchedAt).toLocaleDateString('zh-CN')}</span>
                    {article.isSavedToKB && (
                        <>
                            <span className="mx-0.5 text-gray-300 dark:text-gray-600">·</span>
                            <span className="flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded-md border border-blue-200 dark:border-blue-800">
                                <Database size={10} />
                                已入库
                            </span>
                        </>
                    )}
                    {!compact && article.tags && article.tags.length > 0 && (
                        <>
                            <span className="mx-0.5 text-gray-300 dark:text-gray-600">·</span>
                            {article.tags.map((tag) => {
                                const color = getTagColor(tag);
                                return (
                                    <span
                                        key={tag}
                                        className="px-1.5 py-0.5 rounded-md text-[10px] font-bold"
                                        style={{ backgroundColor: color.bg, color: color.accent }}
                                    >
                                        {tag}
                                    </span>
                                );
                            })}
                        </>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                {!article.isSavedToKB && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onAddToKB(article);
                        }}
                        title="录入知识库"
                        className="p-1.5 rounded-md hover:bg-blue-50 hover:text-blue-500 dark:hover:bg-blue-950/30 text-[var(--color-text-tertiary)] transition-colors"
                    >
                        <Database size={14} />
                    </button>
                )}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDeleteArticle(article.id);
                    }}
                    title="删除记录"
                    className="p-1.5 rounded-md hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30 text-[var(--color-text-tertiary)] transition-colors"
                >
                    <Trash2 size={14} />
                </button>
            </div>
        </div>
    );
}, (prev, next) => prev.article.id === next.article.id && prev.article.tags === next.article.tags);

/* ===== 学习热力图组件 - Memoized ===== */
const LearningHeatmap = memo(function LearningHeatmap({ articles }: { articles: Article[] }) {
    const data = useMemo(() => buildHeatmapData(articles), [articles]);
    const streak = useMemo(() => getStreak(articles), [articles]);
    const totalThisMonth = useMemo(() => articles.filter((a) => {
        const now = new Date();
        const d = new Date(a.fetchedAt);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length, [articles]);

    return (
        <div className="px-5 pt-4 pb-2 flex-shrink-0 border-b border-[var(--color-border-divider)] bg-[var(--color-bg-card)]">
            {/* 统计摘要 */}
            <div className="flex items-center justify-between mb-3">
                <span className="text-[13px] font-bold text-[var(--color-text-primary)]">
                    学习记录
                </span>
                <div className="flex items-center gap-3 text-[12px] font-medium text-[var(--color-text-tertiary)]">
                    {streak > 0 && (
                        <span className="flex items-center gap-1.5 bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-500 px-2 py-0.5 rounded-full">
                            <Flame size={12} />
                            <span>{streak} 天连续</span>
                        </span>
                    )}
                    <span>本月 <b className="text-[var(--color-text-secondary)]">{totalThisMonth}</b> 篇</span>
                </div>
            </div>

            {/* 热力图 */}
            <div className="flex justify-center overflow-hidden" style={{ transform: 'scale(0.95)', transformOrigin: 'top center' }}>
                <ActivityCalendar
                    data={data}
                    maxLevel={4}
                    blockSize={11}
                    blockMargin={3}
                    blockRadius={3}
                    fontSize={11}
                    labels={{ totalCount: '{{count}} 篇学习记录' }}
                    renderColorLegend={() => <></>}
                    showMonthLabels
                    theme={{
                        light: ['#f1f5f9', '#c6e3ff', '#79b8ff', '#2188ff', '#0055d4'],
                        dark: ['#1e293b', '#0e4429', '#006d32', '#26a641', '#39d353'],
                    }}
                    renderBlock={(block, activity) => (
                        <g>
                            {block}
                            <title>{`${activity.date}: 学习了 ${activity.count} 篇文章`}</title>
                        </g>
                    )}
                />
            </div>
        </div>
    );
});

interface HistoryDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    articles: Article[];
    onLoadArticle: (article: Article) => void;
    onDeleteArticle: (id: string) => void;
    onAddToKB: (article: Article) => void;
}

export default function HistoryDrawer({
    isOpen,
    onClose,
    articles,
    onLoadArticle,
    onDeleteArticle,
    onAddToKB,
}: HistoryDrawerProps) {
    const [viewStyle, setViewStyle] = useState<'list' | 'grouped'>('list');

    // 按标签分组 - Memoized
    const groupedByTag = useMemo(() => {
        const map = new Map<string, Article[]>();
        articles.forEach((article) => {
            const tags = article.tags && article.tags.length > 0 ? article.tags : ['未分类'];
            tags.forEach((tag) => {
                if (!map.has(tag)) map.set(tag, []);
                map.get(tag)!.push(article);
            });
        });
        return map;
    }, [articles]);

    const sortedTags = useMemo(() => {
        return [...groupedByTag.keys()].sort((a, b) => {
            if (a === '未分类') return 1;
            if (b === '未分类') return -1;
            return a.localeCompare(b, 'zh-CN');
        });
    }, [groupedByTag]);

    return (
        <>
            {/* 遮罩层 */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] animate-in fade-in duration-300"
                    onClick={onClose}
                />
            )}

            {/* 抽屉面板 */}
            <div
                className={`fixed inset-y-0 left-0 z-50 w-[360px] bg-[var(--color-bg-card)] shadow-2xl overflow-hidden flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] border-r border-[var(--color-border-divider)] ${isOpen ? 'translate-x-0' : '-translate-x-full'
                    }`}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 h-[64px] border-b border-[var(--color-border-divider)] flex-shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-[var(--color-bg-input)] flex items-center justify-center text-[var(--color-text-secondary)]">
                            <History size={16} />
                        </div>
                        <h2 className="text-[16px] font-bold text-[var(--color-text-primary)]">历史文章</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
                    >
                        <X size={18} />
                    </button>
                </div>

                {articles.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-[var(--color-text-tertiary)] gap-4 px-6">
                        <div className="w-14 h-14 rounded-2xl bg-[var(--color-bg-input)] flex items-center justify-center">
                            <History size={24} className="opacity-50" />
                        </div>
                        <p className="text-[14px] text-center font-medium leading-relaxed">
                            还没有保存过的文章
                            <br />
                            导入网页后会自动保留记录
                        </p>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto flex flex-col">
                        {/* 🔥 学习热力图 */}
                        <LearningHeatmap articles={articles} />

                        {/* Segmented Control 视图切换 */}
                        <div className="px-5 pt-4 pb-2 flex-shrink-0">
                            <div className="flex items-center rounded-xl p-1 bg-[var(--color-bg-input)]">
                                <button
                                    onClick={() => setViewStyle('list')}
                                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[13px] font-semibold cursor-pointer transition-all duration-200"
                                    style={
                                        viewStyle === 'list'
                                            ? { backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-primary)', boxShadow: '0 1px 2px rgba(0,0,0,.05)' }
                                            : { backgroundColor: 'transparent', color: 'var(--color-text-tertiary)' }
                                    }
                                >
                                    <List size={14} />
                                    <span>全部列表</span>
                                </button>
                                <button
                                    onClick={() => setViewStyle('grouped')}
                                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[13px] font-semibold cursor-pointer transition-all duration-200"
                                    style={
                                        viewStyle === 'grouped'
                                            ? { backgroundColor: 'var(--color-bg-card)', color: 'var(--color-text-primary)', boxShadow: '0 1px 2px rgba(0,0,0,.05)' }
                                            : { backgroundColor: 'transparent', color: 'var(--color-text-tertiary)' }
                                    }
                                >
                                    <FolderOpen size={14} />
                                    <span>按标签分组</span>
                                </button>
                            </div>
                            <div className="text-[12px] font-medium text-[var(--color-text-tertiary)] text-center mt-3">
                                共 {articles.length} 篇文章
                            </div>
                        </div>

                        {/* 内容列表 */}
                        <div className="flex-1 px-3 pb-4">
                            {viewStyle === 'list' ? (
                                articles.map((article) => (
                                    <ArticleItem
                                        key={article.id}
                                        article={article}
                                        onLoadArticle={(a) => {
                                            onLoadArticle(a);
                                            onClose(); // 点击文章后自动关闭抽屉
                                        }}
                                        onDeleteArticle={onDeleteArticle}
                                        onAddToKB={onAddToKB}
                                    />
                                ))
                            ) : (
                                sortedTags.map((tag) => {
                                    const color = getTagColor(tag);
                                    const count = groupedByTag.get(tag)!.length;
                                    return (
                                        <details key={tag} open className="group mb-2.5">
                                            <summary
                                                className="flex items-center gap-2.5 px-4 py-3 rounded-xl cursor-pointer select-none transition-all border border-transparent hover:border-[var(--color-border-default)]"
                                                style={{ backgroundColor: color.bg, borderLeft: `4px solid ${color.accent}` }}
                                            >
                                                <ChevronRight size={14} className="flex-shrink-0 transition-transform duration-200 group-open:rotate-90" style={{ color: color.accent }} />
                                                <Hash size={14} className="flex-shrink-0" style={{ color: color.accent }} />
                                                <span className="text-[14px] font-bold" style={{ color: color.text }}>{tag}</span>
                                                <span
                                                    className="ml-auto text-[11px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5"
                                                    style={{ backgroundColor: color.accent, color: '#fff' }}
                                                >
                                                    {count}
                                                </span>
                                            </summary>
                                            <div className="ml-4 mt-1.5 pl-3 py-1 space-y-1" style={{ borderLeft: `2px solid ${color.border}` }}>
                                                {groupedByTag.get(tag)!.map((article) => (
                                                    <ArticleItem
                                                        key={article.id}
                                                        article={article}
                                                        onLoadArticle={(a) => {
                                                            onLoadArticle(a);
                                                            onClose(); // 点击文章后自动关闭抽屉
                                                        }}
                                                        onDeleteArticle={onDeleteArticle}
                                                        onAddToKB={onAddToKB}
                                                        compact
                                                    />
                                                ))}
                                            </div>
                                        </details>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}

/* ===== 学习热力图数据转换 ===== */
function buildHeatmapData(articles: Article[]) {
    const countMap = new Map<string, number>();
    articles.forEach((a) => {
        const dateStr = new Date(a.fetchedAt).toISOString().slice(0, 10);
        countMap.set(dateStr, (countMap.get(dateStr) || 0) + 1);
    });

    const days: { date: string; count: number; level: number }[] = [];
    const today = new Date();
    for (let i = 149; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10);
        const count = countMap.get(dateStr) || 0;
        const level = count === 0 ? 0 : count <= 1 ? 1 : count <= 3 ? 2 : count <= 5 ? 3 : 4;
        days.push({ date: dateStr, count, level });
    }
    return days;
}

function getStreak(articles: Article[]): number {
    const dates = new Set(
        articles.map((a) => new Date(a.fetchedAt).toISOString().slice(0, 10))
    );
    let streak = 0;
    const d = new Date();
    while (true) {
        const key = d.toISOString().slice(0, 10);
        if (dates.has(key)) {
            streak++;
            d.setDate(d.getDate() - 1);
        } else {
            break;
        }
    }
    return streak;
}
