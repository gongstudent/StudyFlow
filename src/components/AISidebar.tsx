import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  MessageSquare,
  History,
  Send,
  Sparkles,
  Trash2,
  ExternalLink,
  Clock,
  Bot,
  User as UserIcon,
  Loader2,
  List,
  FolderOpen,
  Hash,
  ChevronRight,
  Flame,
  Highlighter,
} from 'lucide-react';
import { ActivityCalendar } from 'react-activity-calendar';
import type { ChatMessage, Article, SidebarMode } from '../types';
import NotebookPane from './NotebookPane';

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

interface AISidebarProps {
  messages: ChatMessage[];
  onSendMessage: (content: string) => void;
  sidebarMode: SidebarMode;
  onSwitchMode: (mode: SidebarMode) => void;
  savedArticles: Article[];
  onLoadArticle: (article: Article) => void;
  onDeleteArticle: (id: string) => void;
  currentArticle: Article | null;
  onUpdateArticle: (article: Article) => void;
  isStreaming?: boolean;
}

export default function AISidebar({
  messages,
  onSendMessage,
  sidebarMode,
  onSwitchMode,
  savedArticles,
  onLoadArticle,
  onDeleteArticle,
  currentArticle,
  onUpdateArticle,
  isStreaming = false,
}: AISidebarProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [activeTab, setActiveTab] = useState<'chat' | 'notes'>('chat');

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isStreaming]); // Only scroll on new message count or streaming change to avoid jitter

  // 自适应 textarea 高度
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    onSendMessage(trimmed);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const mainTabs = useMemo(() => [
    { key: 'chat', label: 'AI 助手', icon: <Bot size={14} /> },
    { key: 'notes', label: '我的笔记', icon: <Highlighter size={14} /> },
  ], []);

  // 渲染侧边栏顶部 Tab (Chat vs Notes)
  const renderMainTabs = () => (
    <div className="flex bg-[var(--color-bg-tertiary)] p-1 rounded-lg mb-4 mx-4 mt-2">
      {mainTabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => setActiveTab(tab.key as any)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[12px] font-medium rounded-md transition-all ${activeTab === tab.key
            ? 'bg-white text-[var(--color-accent-primary)] shadow-sm'
            : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
            }`}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );

  const renderContent = () => {
    if (sidebarMode === 'history') {
      return (
        <HistoryView
          articles={savedArticles}
          onLoadArticle={onLoadArticle}
          onDeleteArticle={onDeleteArticle}
        />
      );
    }

    // Chat Mode
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {renderMainTabs()}

        {activeTab === 'chat' ? (
          <ChatView
            messages={messages}
            input={input}
            setInput={setInput}
            onSubmit={handleSubmit}
            onKeyDown={handleKeyDown}
            messagesEndRef={messagesEndRef}
            textareaRef={textareaRef}
            adjustTextareaHeight={adjustTextareaHeight}
            isStreaming={isStreaming}
          />
        ) : (
          <NotebookPane
            article={currentArticle}
            onUpdateArticle={onUpdateArticle}
          />
        )}
      </div>
    );
  };

  const navTabs = useMemo(() => [
    { key: 'chat', label: '阅读视角', icon: <MessageSquare size={14} /> },
    { key: 'history', label: '历史文章', icon: <History size={14} /> },
  ], []);

  return (
    <div className="flex flex-col h-full bg-[var(--color-bg-sidebar)]">
      {/* 顶部导航 (阅读 / 历史) */}
      <div className="flex items-end border-b border-[var(--color-border-default)] px-4 h-[44px] flex-shrink-0">
        <div className="flex items-stretch gap-6 h-full">
          {navTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onSwitchMode(tab.key as SidebarMode)}
              className={`flex items-center gap-1.5 text-[13px] font-medium cursor-pointer transition-all relative pb-0 border-b-2 ${sidebarMode === tab.key
                ? 'border-[var(--color-accent-primary)] text-[var(--color-text-primary)]'
                : 'border-transparent text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                }`}
            >
              <span className={sidebarMode === tab.key ? 'text-[var(--color-accent-primary)]' : ''}>
                {tab.icon}
              </span>
              {tab.label}
            </button>
          ))}
        </div>
        {sidebarMode === 'chat' && currentArticle?.title && (
          <div className="ml-auto flex items-center gap-1 text-[11px] text-[var(--color-text-tertiary)] max-w-[140px] pb-2.5">
            <Sparkles size={11} className="flex-shrink-0 text-[var(--color-accent-primary)]" />
            <span className="truncate">{currentArticle.title}</span>
          </div>
        )}
      </div>

      {/* 主体内容 */}
      {renderContent()}
    </div>
  );
}

/* ===== Markdown 渲染组件 (用于 AI 气泡) - Memoized ===== */
const ChatMarkdown = memo(function ChatMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
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
                  margin: '0.5rem 0',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  background: '#f5f5f5',
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
      }}
    >
      {content}
    </ReactMarkdown>
  );
});

/* ===== 单个消息气泡组件 - Memoized ===== */
const MessageItem = memo(function MessageItem({ msg }: { msg: ChatMessage }) {
  return (
    <div
      className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
    >
      {msg.role === 'assistant' && (
        <div className="w-7 h-7 rounded-lg bg-[var(--color-accent-soft)] flex items-center justify-center flex-shrink-0 mt-0.5">
          <Bot size={14} className="text-[var(--color-accent-primary)]" />
        </div>
      )}
      <div
        className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-[13.5px] leading-relaxed chat-bubble-md ${msg.role === 'user'
          ? 'bg-[var(--color-bg-bubble-user)] text-[var(--color-text-inverse)] rounded-br-md'
          : 'bg-[var(--color-bg-bubble-ai)] text-[var(--color-text-primary)] rounded-bl-md border border-[var(--color-border-default)]'
          }`}
      >
        {msg.role === 'assistant' ? (
          msg.content ? (
            <ChatMarkdown content={msg.content} />
          ) : (
            /* 流式等待中的加载动画 */
            <div className="loading-dots flex gap-1 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-text-tertiary)]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-text-tertiary)]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-text-tertiary)]" />
            </div>
          )
        ) : (
          msg.content
        )}
      </div>
      {msg.role === 'user' && (
        <div className="w-7 h-7 rounded-lg bg-[var(--color-bg-tertiary)] flex items-center justify-center flex-shrink-0 mt-0.5">
          <UserIcon size={14} className="text-[var(--color-text-secondary)]" />
        </div>
      )}
    </div>
  );
});

/* ===== 聊天视图 ===== */
function ChatView({
  messages,
  input,
  setInput,
  onSubmit,
  onKeyDown,
  messagesEndRef,
  textareaRef,
  adjustTextareaHeight,
  isStreaming,
}: {
  messages: ChatMessage[];
  input: string;
  setInput: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  adjustTextareaHeight: () => void;
  isStreaming: boolean;
}) {
  return (
    <>
      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-tertiary)] gap-3">
            <div className="w-12 h-12 rounded-xl bg-[var(--color-bg-tertiary)] flex items-center justify-center">
              <Sparkles size={22} className="text-[var(--color-accent-primary)]" />
            </div>
            <p className="text-[13px] text-center leading-relaxed">
              导入文章后，可以向 AI 提问
              <br />
              或选中文本直接发送
            </p>
          </div>
        ) : (
          messages
            .filter((m) => m.role !== 'system')
            .map((msg) => (
              <MessageItem key={msg.id} msg={msg} />
            ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入框 */}
      <form
        onSubmit={onSubmit}
        className="flex-shrink-0 border-t border-[var(--color-border-default)] p-3"
      >
        <div className="flex items-end gap-2 bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-xl px-3 py-2 focus-within:border-[var(--color-accent-primary)] focus-within:ring-2 focus-within:ring-[var(--color-accent-soft)] transition-all">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              adjustTextareaHeight();
            }}
            onKeyDown={onKeyDown}
            placeholder={isStreaming ? 'AI 正在回复中...' : '输入问题，按 Enter 发送...'}
            rows={1}
            disabled={isStreaming}
            className="flex-1 bg-transparent outline-none text-[13.5px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] resize-none leading-relaxed max-h-[120px] disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--color-accent-primary)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex-shrink-0"
          >
            {isStreaming ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
          </button>
        </div>
        <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1.5 px-1">
          {isStreaming
            ? '⏳ AI 正在生成回复...'
            : 'Shift + Enter 换行 · AI 回复基于当前文章上下文'}
        </p>
      </form>
    </>
  );
}

/* ===== 单篇文章条目 - Memoized ===== */
const ArticleItem = memo(function ArticleItem({
  article,
  onLoadArticle,
  onDeleteArticle,
  compact = false,
}: {
  article: Article;
  onLoadArticle: (article: Article) => void;
  onDeleteArticle: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`group flex items-start gap-3 px-3 ${compact ? 'py-2' : 'py-3'} rounded-lg hover:bg-[var(--color-bg-hover)] cursor-pointer transition-colors`}
      onClick={() => onLoadArticle(article)}
    >
      {!compact && (
        <div className="w-8 h-8 rounded-lg bg-[var(--color-bg-tertiary)] flex items-center justify-center flex-shrink-0 mt-0.5">
          <ExternalLink size={14} className="text-[var(--color-text-tertiary)]" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className={`${compact ? 'text-[12.5px]' : 'text-[13px]'} font-medium text-[var(--color-text-primary)] truncate`}>
          {article.title}
        </p>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[11px] text-[var(--color-text-tertiary)]">
          <Clock size={10} />
          <span>{new Date(article.fetchedAt).toLocaleDateString('zh-CN')}</span>
          {!compact && article.tags && article.tags.length > 0 && (
            <>
              <span className="mx-0.5">·</span>
              {article.tags.map((tag) => {
                const color = getTagColor(tag);
                return (
                  <span
                    key={tag}
                    className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold"
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
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDeleteArticle(article.id);
        }}
        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)] hover:text-[var(--color-error)] transition-all"
      >
        <Trash2 size={13} />
      </button>
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
    <div className="px-3 pt-3 pb-1 flex-shrink-0" style={{ borderBottom: '1px solid var(--color-border-default)' }}>
      {/* 统计摘要 */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
          学习记录
        </span>
        <div className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
          {streak > 0 && (
            <span className="flex items-center gap-1">
              <Flame size={12} style={{ color: '#f97316' }} />
              <span style={{ color: '#f97316', fontWeight: 600 }}>{streak}</span> 天连续
            </span>
          )}
          <span>本月 <b style={{ color: 'var(--color-text-secondary)' }}>{totalThisMonth}</b> 篇</span>
        </div>
      </div>

      {/* 热力图 */}
      <div className="flex justify-center overflow-hidden" style={{ transform: 'scale(0.92)', transformOrigin: 'top center' }}>
        <ActivityCalendar
          data={data}
          maxLevel={4}
          blockSize={11}
          blockMargin={3}
          blockRadius={2}
          fontSize={10}
          labels={{ totalCount: '{{count}} 篇学习记录' }}
          renderColorLegend={() => <></>}
          showMonthLabels
          theme={{
            light: ['#ebedf0', '#c6e3ff', '#79b8ff', '#2188ff', '#0055d4'],
            dark: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'],
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

/* ===== 历史记录视图（支持列表/分组切换） ===== */
function HistoryView({
  articles,
  onLoadArticle,
  onDeleteArticle,
}: {
  articles: Article[];
  onLoadArticle: (article: Article) => void;
  onDeleteArticle: (id: string) => void;
}) {
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

  if (articles.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-[var(--color-text-tertiary)] gap-3 px-6">
        <div className="w-12 h-12 rounded-xl bg-[var(--color-bg-tertiary)] flex items-center justify-center">
          <History size={22} />
        </div>
        <p className="text-[13px] text-center">
          还没有保存过的文章
          <br />
          导入网页后会自动保留记录
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      {/* 🔥 学习热力图 */}
      <LearningHeatmap articles={articles} />
      {/* Segmented Control 视图切换 */}
      <div className="px-3 pt-2 pb-1 flex-shrink-0">
        <div className="flex items-center rounded-lg p-1" style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
          <button
            onClick={() => setViewStyle('list')}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[12px] font-medium cursor-pointer transition-all duration-200"
            style={
              viewStyle === 'list'
                ? { backgroundColor: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }
                : { backgroundColor: 'transparent', color: 'var(--color-text-tertiary)' }
            }
          >
            <List size={13} />
            <span>全部列表</span>
          </button>
          <button
            onClick={() => setViewStyle('grouped')}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[12px] font-medium cursor-pointer transition-all duration-200"
            style={
              viewStyle === 'grouped'
                ? { backgroundColor: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }
                : { backgroundColor: 'transparent', color: 'var(--color-text-tertiary)' }
            }
          >
            <FolderOpen size={13} />
            <span>按标签分组</span>
          </button>
        </div>
        <div className="text-[11px] text-[var(--color-text-tertiary)] text-center mt-1.5">
          {articles.length} 篇文章
        </div>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {viewStyle === 'list' ? (
          articles.map((article) => (
            <ArticleItem
              key={article.id}
              article={article}
              onLoadArticle={onLoadArticle}
              onDeleteArticle={onDeleteArticle}
            />
          ))
        ) : (
          sortedTags.map((tag) => {
            const color = getTagColor(tag);
            const count = groupedByTag.get(tag)!.length;
            return (
              <details key={tag} open className="group mb-2">
                <summary
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer select-none transition-all hover:shadow-sm"
                  style={{ backgroundColor: color.bg, borderLeft: `3px solid ${color.accent}` }}
                >
                  <ChevronRight size={13} className="flex-shrink-0 transition-transform duration-200 group-open:rotate-90" style={{ color: color.accent }} />
                  <Hash size={13} className="flex-shrink-0" style={{ color: color.accent }} />
                  <span className="text-[13px] font-semibold" style={{ color: color.text }}>{tag}</span>
                  <span
                    className="ml-auto text-[11px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5"
                    style={{ backgroundColor: color.accent, color: '#fff' }}
                  >
                    {count}
                  </span>
                </summary>
                <div className="ml-3 mt-1 pl-2" style={{ borderLeft: `2px solid ${color.border}` }}>
                  {groupedByTag.get(tag)!.map((article) => (
                    <ArticleItem
                      key={article.id}
                      article={article}
                      onLoadArticle={onLoadArticle}
                      onDeleteArticle={onDeleteArticle}
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
  );
}

/* ===== 学习热力图数据转换 (Moved to helper functions to keep component clean) ===== */
function buildHeatmapData(articles: Article[]) {
  // 按日期聚合
  const countMap = new Map<string, number>();
  articles.forEach((a) => {
    const dateStr = new Date(a.fetchedAt).toISOString().slice(0, 10);
    countMap.set(dateStr, (countMap.get(dateStr) || 0) + 1);
  });

  // 生成最近 150 天的连续日期
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