import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  Send,
  Square,
  Sparkles,
  Highlighter,
  Bot,
  User as UserIcon,
} from 'lucide-react';
import type { ChatMessage, Article } from '../types';
import NotebookPane from './NotebookPane';

interface AISidebarProps {
  messages: ChatMessage[];
  onSendMessage: (content: string) => void;
  onStopStreaming?: () => void;
  currentArticle: Article | null;
  onUpdateArticle: (article: Article) => void;
  isStreaming?: boolean;
  chatMode?: 'article' | 'knowledge';
  onChatModeChange?: (mode: 'article' | 'knowledge') => void;
  knowledgeChatEnabled?: boolean;
  knowledgeChatUnavailableReason?: string;
}

export default function AISidebar({
  messages,
  onSendMessage,
  onStopStreaming,
  currentArticle,
  onUpdateArticle,
  isStreaming = false,
  chatMode = 'article',
  onChatModeChange,
  knowledgeChatEnabled = true,
  knowledgeChatUnavailableReason = '',
}: AISidebarProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [activeTab, setActiveTab] = useState<'chat' | 'notes'>('chat');

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isStreaming]);

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
    if (!trimmed || isStreaming || (chatMode === 'knowledge' && !knowledgeChatEnabled)) return;
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

  const mainTabs = useMemo(
    () => [
      { key: 'chat', label: 'AI 助手', icon: <Bot size={14} /> },
      { key: 'notes', label: '我的笔记', icon: <Highlighter size={14} /> },
    ],
    []
  );

  return (
    <div className="flex flex-col h-full bg-[var(--color-bg-card)]">
      <div className="flex flex-col h-full overflow-hidden pt-4">
        <div className="px-5 pb-3 flex-shrink-0">
          <div className="flex bg-[var(--color-bg-input)] p-2 rounded-none border border-[var(--color-border-default)]">
            {mainTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as 'chat' | 'notes')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[14px] font-medium rounded-none transition-all ${
                  activeTab === tab.key
                    ? 'bg-[var(--color-bg-card)] text-[var(--color-accent-primary)] shadow-sm'
                    : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

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
            onStopStreaming={onStopStreaming}
            chatMode={chatMode}
            onChatModeChange={onChatModeChange}
            knowledgeChatEnabled={knowledgeChatEnabled}
            knowledgeChatUnavailableReason={knowledgeChatUnavailableReason}
          />
        ) : (
          <NotebookPane article={currentArticle} onUpdateArticle={onUpdateArticle} />
        )}
      </div>
    </div>
  );
}

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

const MessageItem = memo(function MessageItem({ msg }: { msg: ChatMessage }) {
  return (
    <div
      className={`flex items-start gap-2.5 py-1 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
    >
      {msg.role === 'assistant' && (
        <div className="w-7 h-7 rounded-none bg-[var(--color-accent-soft)] flex items-center justify-center flex-shrink-0 mt-0.5">
          <Bot size={14} className="text-[var(--color-accent-primary)]" />
        </div>
      )}
      <div
        className={`max-w-[86%] px-5 py-4 rounded-none text-[15px] leading-[1.75] chat-bubble-md break-words whitespace-pre-wrap overflow-visible ${
          msg.role === 'user'
            ? 'bg-[var(--color-bg-bubble-user)] text-[var(--color-text-inverse)] shadow-sm'
            : 'bg-[var(--color-bg-bubble-ai)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] shadow-sm'
        }`}
      >
        {msg.role === 'assistant' ? (
          msg.content ? (
            <ChatMarkdown content={msg.content} />
          ) : (
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
        <div className="w-7 h-7 rounded-none bg-[var(--color-bg-tertiary)] flex items-center justify-center flex-shrink-0 mt-0.5">
          <UserIcon size={14} className="text-[var(--color-text-secondary)]" />
        </div>
      )}
    </div>
  );
});

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
  onStopStreaming,
  chatMode,
  onChatModeChange,
  knowledgeChatEnabled,
  knowledgeChatUnavailableReason,
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
  onStopStreaming?: () => void;
  chatMode?: 'article' | 'knowledge';
  onChatModeChange?: (mode: 'article' | 'knowledge') => void;
  knowledgeChatEnabled?: boolean;
  knowledgeChatUnavailableReason?: string;
}) {
  const visibleMessages = messages.filter((m) => m.role !== 'system');
  const isKnowledgeModeUnavailable = chatMode === 'knowledge' && !knowledgeChatEnabled;

  return (
    <>
      {onChatModeChange && (
        <div className="flex px-4 pt-4 pb-0 flex-shrink-0">
          <div className="flex bg-[var(--color-bg-input)] rounded-none p-1.5 border border-[var(--color-border-default)] w-full shadow-sm">
            <button
              onClick={() => onChatModeChange('article')}
              className={`flex-1 py-2 text-[12px] font-medium rounded-none transition-all ${
                chatMode === 'article'
                  ? 'bg-[var(--color-bg-card)] text-[var(--color-accent-primary)] shadow-sm'
                  : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
              }`}
            >
              当前文章
            </button>
            <button
              onClick={() => onChatModeChange('knowledge')}
              disabled={!knowledgeChatEnabled}
              className={`flex-1 flex justify-center items-center gap-1 py-2 text-[12px] font-medium rounded-none transition-all ${
                !knowledgeChatEnabled
                  ? 'text-[var(--color-text-tertiary)] opacity-50 cursor-not-allowed'
                  : chatMode === 'knowledge'
                    ? 'bg-[var(--color-bg-card)] text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
              }`}
            >
              全局知识库
            </button>
          </div>
        </div>
      )}

      {isKnowledgeModeUnavailable && knowledgeChatUnavailableReason && (
        <div className="mx-4 mt-3 rounded-none border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-700">
          全局知识库聊天暂不可用：{knowledgeChatUnavailableReason}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-7 flex flex-col gap-12">
        {visibleMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-tertiary)] gap-3">
            <div className="w-12 h-12 rounded-none bg-[var(--color-bg-tertiary)] flex items-center justify-center">
              <Sparkles size={22} className="text-[var(--color-accent-primary)]" />
            </div>
            <p className="text-[13px] text-center leading-relaxed">
              导入文章后，可以向 AI 提问
              <br />
              或选中文本直接发送
            </p>
          </div>
        ) : (
          visibleMessages.map((msg) => <MessageItem key={msg.id} msg={msg} />)
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={onSubmit} className="flex-shrink-0 p-4">
        <div className="flex items-end bg-[var(--color-bg-input)] rounded-none pl-5 pr-3 py-3 focus-within:bg-[var(--color-bg-card)] focus-within:ring-2 focus-within:ring-[var(--color-accent-soft)] transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] border border-[var(--color-border-default)]">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              adjustTextareaHeight();
            }}
            onKeyDown={onKeyDown}
            placeholder={
              isKnowledgeModeUnavailable
                ? '全局知识库当前不可用，请先修复 Embedding 或 Qdrant 连接'
                : isStreaming
                  ? 'AI 正在回复中...'
                  : chatMode === 'knowledge'
                    ? '向全局知识库提问...'
                    : '输入问题，按 Enter 发送...'
            }
            rows={1}
            disabled={isStreaming || isKnowledgeModeUnavailable}
            className="flex-1 bg-transparent outline-none text-[14.5px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] resize-none leading-relaxed max-h-[120px] disabled:opacity-50 py-1"
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={onStopStreaming}
              className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-none bg-red-500 text-white hover:bg-red-600 transition-colors shadow-sm ml-3 mb-0"
              title="终止输出"
            >
              <Square size={12} fill="currentColor" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() || isKnowledgeModeUnavailable}
              className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-none bg-[var(--color-accent-primary)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors shadow-sm ml-3 mb-0"
            >
              <Send size={14} />
            </button>
          )}
        </div>
        <p className="text-[11px] text-[var(--color-text-tertiary)] mt-2 text-center">
          {isStreaming
            ? 'AI 正在生成回复，点击右侧红色停止按钮可立即中断'
            : isKnowledgeModeUnavailable
              ? '请先在模型设置中配置可用 Embedding，并确保 Qdrant 服务可访问'
              : chatMode === 'knowledge'
                ? 'Shift + Enter 换行 · 全局 RAG 检索问答'
                : 'Shift + Enter 换行 · AI 回复基于当前文章上下文'}
        </p>
      </form>
    </>
  );
}
