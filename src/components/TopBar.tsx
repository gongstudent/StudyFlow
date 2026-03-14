import { useState, useRef, useEffect } from 'react';
import { Globe, ArrowRight, Loader2, BookOpen, ClipboardPaste, Upload, Sun, Moon, Settings, History, Database, X, CheckCircle2, Trash2 } from 'lucide-react';
import type { Article } from '../types';
import SettingsModal from './SettingsModal';

// ... (CORS_PROXY_URL remains same)

interface TopBarProps {
  onFetchUrl: (url: string) => void;
  onFileUpload: (file: File) => void;
  isFetching: boolean;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onToggleHistory?: () => void;
  activeTab?: 'reader' | 'knowledge';
  onTabChange?: (tab: 'reader' | 'knowledge') => void;
  kbArticles?: Article[];
  onRemoveFromKB?: (article: Article) => void;
}

export default function TopBar({
  onFetchUrl,
  onFileUpload,
  isFetching,
  theme,
  onToggleTheme,
  onToggleHistory,
  activeTab = 'reader',
  onTabChange,
  kbArticles = [],
  onRemoveFromKB,
}: TopBarProps) {
  const [inputUrl, setInputUrl] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    // ... (remains same)
    e.preventDefault();
    const trimmed = inputUrl.trim();
    if (!trimmed) return;
    const url = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
    onFetchUrl(url);
  };

  const handlePasteAndFetch = async () => {
    // ... (remains same)
    try {
      const text = await navigator.clipboard.readText();
      const trimmed = text?.trim();
      if (!trimmed || !trimmed.startsWith('http')) {
        alert('剪贴板里没有链接');
        return;
      }
      setInputUrl(trimmed);
      onFetchUrl(trimmed);
    } catch {
      alert('无法读取剪贴板，请检查浏览器权限');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileUpload(file);
    }
    // 重置 input，允许重复选择同一文件
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const [isKBHistoryOpen, setIsKBHistoryOpen] = useState(false);
  const kbHistoryRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭 Popover
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (kbHistoryRef.current && !kbHistoryRef.current.contains(event.target as Node)) {
        setIsKBHistoryOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="relative flex items-center justify-between h-[64px] bg-transparent px-6 z-30 border-b border-[var(--color-border-default)]">

      {/* ── 左侧：固定的 Logo 区域 (w-1/4 保证固定空间) ── */}
      <div className="flex items-center gap-3 w-1/4 min-w-[200px]">
        <button
          onClick={onToggleHistory}
          title="历史记录"
          className="flex items-center justify-center w-9 h-9 rounded-xl text-[var(--color-text-secondary)] hover:text-indigo-600 hover:bg-[var(--color-bg-hover)] transition-all cursor-pointer bg-[var(--color-bg-card)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] border border-[var(--color-border-default)]"
        >
          <History size={18} />
        </button>

        <div className="flex items-center gap-2 ml-1 cursor-default">
          <div className="w-8 h-8 rounded-[10px] shadow-sm flex items-center justify-center transition-colors bg-indigo-600">
            <BookOpen size={16} className="text-white" />
          </div>
          <span className="font-bold text-[17px] text-[var(--color-text-primary)] tracking-tight hidden sm:inline">
            StudyFlow
          </span>
        </div>
      </div>

      {/* ── 中间：绝对居中的 Tabs 与平滑展开的输入框 ── */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center h-[44px] pointer-events-none">
        <div className="flex items-center justify-center h-full pointer-events-auto">
          {/* 选项卡 (Tabs) */}
          {onTabChange && (
            <div className="flex-shrink-0 flex bg-[var(--color-bg-input)] rounded-full p-1 border border-[var(--color-border-default)] shadow-[0_1px_2px_rgba(0,0,0,0.02)] h-[40px] items-center text-indigo-100">
              <button
                onClick={() => onTabChange('reader')}
                className={`px-5 py-1.5 text-[14px] font-medium rounded-full transition-all duration-300 ${activeTab === 'reader'
                  ? 'bg-[var(--color-bg-card)] text-indigo-600 dark:text-indigo-400 shadow-sm scale-100'
                  : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] scale-95'
                  }`}
              >
                阅读引擎
              </button>
              <button
                onClick={() => onTabChange('knowledge')}
                className={`px-5 py-1.5 text-[14px] font-medium rounded-full transition-all duration-300 ${activeTab === 'knowledge'
                  ? 'bg-[var(--color-bg-card)] text-indigo-600 dark:text-indigo-400 shadow-sm scale-100'
                  : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] scale-95'
                  }`}
              >
                知识库
              </button>
            </div>
          )}

          {/* URL 输入框封装容器 (平滑展开) */}
          <div
            className={`overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] flex items-center ${activeTab === 'reader' ? 'w-[400px] opacity-100 ml-3' : 'w-0 opacity-0 ml-0 border-transparent'
              }`}
          >
            <form onSubmit={handleSubmit} className="flex-1 flex w-full">
              <div className="flex items-center w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] rounded-full px-4 h-10 gap-2 focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/10 transition-all min-w-[300px]">
                {/* 内部元素 */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="导入本地文件 (.md / .txt)"
                  className="flex items-center justify-center w-7 h-7 rounded-md text-[var(--color-text-tertiary)] hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors flex-shrink-0 cursor-pointer"
                >
                  <Upload size={16} />
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".md,.txt,.pdf,.docx"
                  className="hidden"
                />

                <div className="w-px h-4 bg-[var(--color-border-default)] mx-1" />

                <Globe size={15} className="text-[var(--color-text-tertiary)] flex-shrink-0" />
                <input
                  type="text"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder="粘贴 URL 或导入文件..."
                  className="flex-1 bg-transparent outline-none text-[14px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)]"
                />

                <button
                  type="button"
                  onClick={handlePasteAndFetch}
                  disabled={isFetching}
                  title="粘贴并抓取"
                  className="flex items-center justify-center w-7 h-7 rounded-md text-[var(--color-text-tertiary)] hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 disabled:opacity-40 transition-colors flex-shrink-0"
                >
                  <ClipboardPaste size={14} />
                </button>
                <button
                  type="submit"
                  disabled={isFetching || !inputUrl.trim()}
                  className="flex items-center justify-center w-7 h-7 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors flex-shrink-0 shadow-sm"
                >
                  {isFetching ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* ── 右侧：操作区 (w-1/4, flex-end) ── */}
      <div className="flex items-center justify-end gap-2 w-1/4 min-w-[280px]">
        {/* 知识库录入记录 Popover (新增) */}
        <div className="relative" ref={kbHistoryRef}>
          <button
            onClick={() => setIsKBHistoryOpen(!isKBHistoryOpen)}
            title="知识库录入记录"
            className={`flex items-center justify-center w-9 h-9 rounded-full transition-all cursor-pointer ${isKBHistoryOpen
              ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400'
              : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]'
              }`}
          >
            <Database size={17} />
          </button>

          {/* Popover 内容骨架 */}
          {isKBHistoryOpen && (
            <div className="absolute right-0 top-[calc(100%+12px)] w-[320px] bg-[var(--color-bg-card)] border border-[var(--color-border-default)] rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 origin-top-right">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-default)] bg-[var(--color-bg-base)]">
                <h3 className="text-[14px] font-semibold text-[var(--color-text-primary)] tracking-tight">知识库录入明细</h3>
                <button onClick={() => setIsKBHistoryOpen(false)} className="p-1 rounded-md text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)]">
                  <X size={14} />
                </button>
              </div>
              <div className="p-2 max-h-[340px] overflow-y-auto">
                {kbArticles.length > 0 ? (
                  kbArticles.map((article) => (
                    <div key={article.id} className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-[var(--color-bg-hover)] transition-colors group">
                      <div className="mt-0.5 text-green-500 flex-shrink-0 cursor-default">
                        <CheckCircle2 size={15} />
                      </div>
                      <div className="min-w-0 flex-1 cursor-default">
                        <p className="text-[13px] font-medium text-[var(--color-text-primary)] leading-tight truncate" title={article.title}>
                          {article.title}
                        </p>
                        <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1">
                          {new Date(article.fetchedAt).toLocaleString()} • 入库成功
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onRemoveFromKB) onRemoveFromKB(article);
                        }}
                        title="从知识库移除"
                        className="opacity-0 group-hover:opacity-100 p-1.5 -m-1.5 rounded-md text-[var(--color-text-tertiary)] hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 transition-all cursor-pointer"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="py-8 flex-col items-center justify-center text-[var(--color-text-tertiary)] flex">
                    <Database size={24} className="mb-2 opacity-30" />
                    <span className="text-[12.5px]">暂无最近的录入记录</span>
                  </div>
                )}
              </div>
              <div className="px-4 py-2 border-t border-[var(--color-border-default)] bg-[var(--color-bg-hover)] text-center">
                <button className="text-[12px] font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400">
                  管理知识库
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 主题切换 */}
        <button
          onClick={onToggleTheme}
          title={theme === 'light' ? '切换到晚间模式' : '切换到早间模式'}
          className="flex items-center justify-center w-9 h-9 rounded-full text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-all cursor-pointer"
        >
          {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
        </button>

        {/* 设置 */}
        <button
          onClick={() => setIsSettingsOpen(true)}
          title="系统设置"
          className="flex items-center justify-center w-9 h-9 rounded-full text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-all cursor-pointer"
        >
          <Settings size={17} />
        </button>
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </header>
  );
}
