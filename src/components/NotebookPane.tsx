import { Trash2, MessageSquare, Highlighter } from 'lucide-react';
import type { Article, Highlight } from '../types';
import { highlightAndScroll } from '../utils/navigation';

interface NotebookPaneProps {
    article: Article | null;
    onUpdateArticle: (article: Article) => void;
}

export default function NotebookPane({ article, onUpdateArticle }: NotebookPaneProps) {
    if (!article || !article.highlights || article.highlights.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-tertiary)] gap-3">
                <div className="w-12 h-12 rounded-xl bg-[var(--color-bg-tertiary)] flex items-center justify-center">
                    <Highlighter size={20} />
                </div>
                <p className="text-sm">暂无高亮或笔记</p>
                <p className="text-xs text-[var(--color-text-quaternary)]">在阅读时选中文字即可添加</p>
            </div>
        );
    }

    // 按时间倒序排列
    const sortedHighlights = [...article.highlights].sort((a, b) => b.createdAt - a.createdAt);

    const handleDelete = (id: string) => {
        const newHighlights = article.highlights?.filter(h => h.id !== id) || [];
        onUpdateArticle({ ...article, highlights: newHighlights });
    };

    const handleJump = async (highlight: Highlight) => {
        console.log('NotebookPane handleJump:', highlight);
        // 1. 如果是 PDF 且有页码，先触发翻页
        if (highlight.pageNumber) {
            console.log('Dispatching pdf-jump-to-page:', highlight.pageNumber);
            window.dispatchEvent(new CustomEvent('pdf-jump-to-page', { detail: { page: highlight.pageNumber } }));
            // 等待 PDF 组件响应并开始渲染
            await new Promise(r => setTimeout(r, 600));
        }

        // 2. 开始轮询查找文本并高亮
        console.log('Starting polling for text:', highlight.text);
        highlightAndScroll(highlight.text);
    };

    return (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {sortedHighlights.map((item) => (
                <div
                    key={item.id}
                    className="group relative bg-white rounded-lg p-3 shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => handleJump(item)}
                >
                    {/* 删除按钮 (Hover 显示) */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(item.id);
                        }}
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all z-10"
                        title="删除"
                    >
                        <Trash2 size={14} />
                    </button>

                    {/* 原文引用 */}
                    <div className="flex gap-2">
                        <div className={`w-1 rounded-full shrink-0 ${item.color === 'blue' ? 'bg-blue-400' : 'bg-yellow-400'}`} />
                        <div className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed line-clamp-4">
                            {item.text}
                        </div>
                    </div>

                    {/* 笔记内容 */}
                    {item.note && (
                        <div className="mt-3 pt-3 border-t border-gray-50 flex gap-2">
                            <MessageSquare size={14} className="text-blue-400 shrink-0 mt-0.5" />
                            <div className="text-[14px] text-[var(--color-text-primary)]">
                                {item.note}
                            </div>
                        </div>
                    )}

                    {/* 时间 */}
                    <div className="mt-2 text-[10px] text-gray-300 text-right">
                        {item.pageNumber ? `第 ${item.pageNumber} 页 · ` : ''}
                        {new Date(item.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                </div>
            ))}
        </div>
    );
}
