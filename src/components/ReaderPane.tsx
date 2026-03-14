import { useRef, useEffect, memo } from 'react';
import { API_BASE_URL } from '../lib/config';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { FileText, BookOpen } from 'lucide-react';
import SelectionToolbar from './SelectionToolbar';
import PDFViewer from './PDFViewer';
import { useTextSelection } from '../hooks/useTextSelection';
import type { Article, Highlight } from '../types';

interface ReaderPaneProps {
  article: Article | null;
  onSelectText: (text: string) => void;
  onUpdateArticle?: (article: Article) => void;
}

// 独立的 Markdown 渲染组件，使用 memo 避免因父组件状态变更（如划词菜单弹出）导致的重绘
const ArticleContent = memo(function ArticleContent({
  content,
  url
}: {
  content: string;
  url: string;
}) {
  return (
    <div className="markdown-body w-full break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, rehypeKatex]}
        components={{
          code({ className, children, ...rest }) {
            const match = /language-(\w+)/.exec(className || '');
            const codeStr = String(children).replace(/\n$/, '');

            if (match) {
              return (
                <SyntaxHighlighter
                  style={oneLight}
                  language={match[1]}
                  PreTag="div"
                  customStyle={{
                    margin: 0,
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    background: '#f0eff8',
                  }}
                >
                  {codeStr}
                </SyntaxHighlighter>
              );
            }

            return (
              <code className={className} {...rest}>
                {children}
              </code>
            );
          },
          img: ({ src, alt, ...rest }) => {
            // 外部图片通过代理加载（绕过防盗链）
            let proxiedSrc = src || '';
            if (API_BASE_URL && (proxiedSrc.startsWith('http://') || proxiedSrc.startsWith('https://'))) {
              proxiedSrc = `${API_BASE_URL}/api/img-proxy?url=${encodeURIComponent(proxiedSrc)}&referer=${encodeURIComponent(url)}`;
            }
            return (
              <img
                src={proxiedSrc}
                alt={alt || ''}
                referrerPolicy="no-referrer"
                loading="lazy"
                className="max-w-full h-auto rounded-lg shadow-sm my-4 border border-gray-100"
                onError={(e) => {
                  e.currentTarget.style.border = '2px solid red';
                }}
                {...rest}
              />
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

export default function ReaderPane({ article, onSelectText, onUpdateArticle }: ReaderPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // useTextSelection 会导致组件重绘，必须隔离 Markdown 渲染
  const { isVisible, position, text, clearSelection } = useTextSelection(containerRef as React.RefObject<HTMLElement>);

  // 监听 PDF 组件派发的自定义事件
  useEffect(() => {
    const handlePdfSelectAction = (e: Event) => {
      const customEvent = e as CustomEvent<{ action: string; text: string; data?: string; pageNumber?: number }>;
      const { action, text: selectedText, data, pageNumber } = customEvent.detail;
      handleActionInternal(action, selectedText, data, pageNumber);
    };

    window.addEventListener('pdf-select-action', handlePdfSelectAction);
    return () => {
      window.removeEventListener('pdf-select-action', handlePdfSelectAction);
    };
  }, [article?.id, onSelectText, onUpdateArticle]); // 减少依赖，只依赖 id

  const handleActionInternal = (action: string, selectedText: string, data?: string, pageNumber?: number) => {
    if (action === '高亮' || action === '笔记') {
      if (!article || !onUpdateArticle) return;

      const newHighlight: Highlight = {
        id: crypto.randomUUID(),
        text: selectedText,
        note: action === '笔记' ? data : undefined,
        color: action === '笔记' ? 'blue' : 'yellow',
        createdAt: Date.now(),
        pageNumber: pageNumber // Save pageNumber
      };

      const updatedArticle = {
        ...article,
        highlights: [...(article.highlights || []), newHighlight]
      };

      onUpdateArticle(updatedArticle);
      clearSelection();
    } else {
      // AI Actions
      onSelectText(`[${action}] ${selectedText}`);
      clearSelection();
    }
  };

  const handleToolbarAction = (action: string, data?: string) => {
    if (text) {
      handleActionInternal(action, text, data);
    }
  };

  // 空状态
  if (!article) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-[var(--color-text-tertiary)] gap-4 px-8">
        <div className="w-16 h-16 rounded-2xl bg-[var(--color-bg-tertiary)] flex items-center justify-center">
          <BookOpen size={28} className="text-[var(--color-text-tertiary)]" />
        </div>
        <div className="text-center">
          <p className="text-[17px] font-medium text-[var(--color-text-secondary)] mb-1">
            开始你的学习之旅
          </p>
          <p className="text-[14px]">
            在顶部输入网页 URL，内容将显示在这里
          </p>
        </div>
      </div>
    );
  }

  // PDF 原文模式
  if (article.fileType === 'pdf') {
    return (
      <div className="flex-1 flex flex-col h-full relative">
        {/* 如果有 Blob 数据，直接渲染 */}
        {article.fileData ? (
          <PDFViewer file={article.fileData} />
        ) : (
          /* 兼容旧数据或 URL 形式 PDF */
          <div className="flex items-center justify-center h-full text-gray-500 flex-col gap-2">
            <FileText size={48} className="text-gray-300" />
            <p>暂无 PDF 原文件数据</p>
            <p className="text-sm text-gray-400">仅显示提取后的文本内容，请切换到 Markdown 视图查看</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto relative">
      <div className="w-full px-10 py-6">
        {/* 文章标题 */}
        <div className="mb-6">
          <h1 className="text-[32px] font-bold text-[var(--color-text-primary)] leading-tight mb-2">
            {article.title}
          </h1>
          <div className="flex items-center gap-2 text-[14px] text-[var(--color-text-tertiary)]">
            <FileText size={13} />
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--color-text-link)] transition-colors truncate max-w-md"
            >
              {article.url}
            </a>
            <span>·</span>
            <span>{new Date(article.fetchedAt).toLocaleDateString('zh-CN')}</span>
          </div>
        </div>

        {/* Markdown 内容 - 使用 Memoized 组件 */}
        <ArticleContent content={article.content} url={article.url} />
      </div>

      {/* 划词浮窗 */}
      {isVisible && text && (
        <SelectionToolbar
          rect={{
            left: position.x,
            top: position.y,
            width: 0,
            height: 0,
            right: position.x,
            bottom: position.y,
            toJSON: () => { }
          } as DOMRect}
          containerRef={containerRef}
          onAction={handleToolbarAction}
        />
      )}
    </div>
  );
}
