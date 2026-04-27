import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardPaste,
  Database,
  Globe,
  History,
  Loader2,
  Moon,
  Settings,
  Sun,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { KbSourceItem } from '../types';
import SettingsModal from './SettingsModal';

interface TopBarProps {
  onFetchUrl: (url: string) => void;
  onFileUpload: (file: File) => void;
  isFetching: boolean;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onToggleHistory?: () => void;
  activeTab?: 'reader' | 'knowledge';
  onTabChange?: (tab: 'reader' | 'knowledge') => void;
  kbSources?: KbSourceItem[];
  onRemoveFromKBSource?: (source: string, label?: string) => void;
}

function formatSourceTime(ts?: number | null): string {
  if (!ts || !Number.isFinite(ts)) return 'Unknown time';
  return new Date(ts).toLocaleString();
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
  kbSources = [],
  onRemoveFromKBSource,
}: TopBarProps) {
  const [inputUrl, setInputUrl] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isKBHistoryOpen, setIsKBHistoryOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const kbHistoryRef = useRef<HTMLDivElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputUrl.trim();
    if (!trimmed) return;
    const url = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
    onFetchUrl(url);
  };

  const handlePasteAndFetch = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const trimmed = text?.trim();
      if (!trimmed || !trimmed.startsWith('http')) {
        alert('剪贴板里没有可用链接');
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
    if (file) onFileUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (kbHistoryRef.current && !kbHistoryRef.current.contains(event.target as Node)) {
        setIsKBHistoryOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="relative flex items-center justify-between h-[64px] bg-transparent px-6 z-30 border-b border-[var(--color-border-default)]">
      <div className="flex items-center gap-3 w-1/4 min-w-[200px]">
        <button
          onClick={onToggleHistory}
          title="历史记录"
          className="flex items-center justify-center w-10 h-10 rounded-none text-[var(--color-text-secondary)] hover:text-indigo-600 hover:bg-[var(--color-bg-hover)] transition-all cursor-pointer bg-[var(--color-bg-card)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] border border-[var(--color-border-default)]"
        >
          <History size={18} />
        </button>

        <div className="flex items-center gap-2 ml-1 cursor-default">
          <div className="w-9 h-9 rounded-none shadow-sm flex items-center justify-center transition-colors bg-indigo-600">
            <BookOpen size={16} className="text-white" />
          </div>
          <span className="font-bold text-[17px] text-[var(--color-text-primary)] tracking-tight hidden sm:inline">
            StudyFlow
          </span>
        </div>
      </div>

      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center h-[44px] pointer-events-none">
        <div className="flex items-center justify-center h-full pointer-events-auto">
          {onTabChange && (
            <div className="flex-shrink-0 flex bg-[var(--color-bg-input)] rounded-none p-1.5 border border-[var(--color-border-default)] shadow-[0_1px_2px_rgba(0,0,0,0.02)] h-[44px] items-center">
              <button
                onClick={() => onTabChange('reader')}
                className={`px-6 py-2 text-[14px] font-medium rounded-none transition-all duration-300 ${
                  activeTab === 'reader'
                    ? 'bg-[var(--color-bg-card)] text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                阅读引擎
              </button>
              <button
                onClick={() => onTabChange('knowledge')}
                className={`px-6 py-2 text-[14px] font-medium rounded-none transition-all duration-300 ${
                  activeTab === 'knowledge'
                    ? 'bg-[var(--color-bg-card)] text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                知识库
              </button>
            </div>
          )}

          <div
            className={`overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] flex items-center ${
              activeTab === 'reader' ? 'w-[400px] opacity-100 ml-3' : 'w-0 opacity-0 ml-0 border-transparent'
            }`}
          >
            <form onSubmit={handleSubmit} className="flex-1 flex w-full">
              <div className="flex items-center w-full bg-[var(--color-bg-input)] border border-[var(--color-border-default)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] rounded-none px-5 h-11 gap-2.5 focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/10 transition-all min-w-[300px]">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="导入本地文件 (.md / .txt / .pdf / .docx)"
                  className="flex items-center justify-center w-8 h-8 rounded-none text-[var(--color-text-tertiary)] hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors flex-shrink-0 cursor-pointer"
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
                  className="flex items-center justify-center w-8 h-8 rounded-none text-[var(--color-text-tertiary)] hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 disabled:opacity-40 transition-colors flex-shrink-0"
                >
                  <ClipboardPaste size={14} />
                </button>
                <button
                  type="submit"
                  disabled={isFetching || !inputUrl.trim()}
                  className="flex items-center justify-center w-8 h-8 rounded-none bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors flex-shrink-0 shadow-sm"
                >
                  {isFetching ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 w-1/4 min-w-[280px]">
        <div className="relative" ref={kbHistoryRef}>
          <button
            onClick={() => setIsKBHistoryOpen((v) => !v)}
            title="知识库录入明细"
            className={`flex items-center justify-center w-10 h-10 rounded-none transition-all cursor-pointer ${
              isKBHistoryOpen
                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400'
                : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]'
            }`}
          >
            <Database size={17} />
          </button>

          {isKBHistoryOpen && (
            <div className="absolute right-0 top-[calc(100%+12px)] w-[420px] bg-[var(--color-bg-card)] border border-[var(--color-border-default)] rounded-none shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 origin-top-right antialiased">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-default)] bg-[var(--color-bg-base)]">
                <h3 className="text-[15px] leading-[1.35] font-semibold text-[var(--color-text-primary)]">知识库录入明细</h3>
                <button
                  onClick={() => setIsKBHistoryOpen(false)}
                  className="p-1.5 rounded-none text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)]"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="p-3 max-h-[420px] overflow-y-auto">
                {kbSources.length > 0 ? (
                  kbSources.map((item) => (
                    <div
                      key={item.sourceKey || item.source}
                      className="flex items-start gap-3 p-3 rounded-none hover:bg-[var(--color-bg-hover)] transition-colors group"
                    >
                      <div className="mt-0.5 text-green-500 flex-shrink-0 cursor-default">
                        <CheckCircle2 size={15} />
                      </div>
                      <div className="min-w-0 flex-1 cursor-default">
                        <p
                          className="text-[14px] font-semibold text-[var(--color-text-primary)] leading-[1.45] whitespace-normal break-all"
                          title={item.source}
                        >
                          {item.source}
                        </p>
                        <p className="text-[12.5px] text-[var(--color-text-secondary)] mt-1 leading-[1.45]">
                          {formatSourceTime(item.lastIngestedAt)} · {item.chunkCount} chunks
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveFromKBSource?.(item.sourceKey || item.source, item.source);
                        }}
                        title="从知识库移除"
                        className="opacity-0 group-hover:opacity-100 p-1.5 -m-1.5 rounded-none text-[var(--color-text-tertiary)] hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 transition-all cursor-pointer"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="py-8 flex-col items-center justify-center text-[var(--color-text-tertiary)] flex">
                    <Database size={24} className="mb-2 opacity-30" />
                    <span className="text-[13px] leading-[1.5]">暂无最近录入记录</span>
                  </div>
                )}
              </div>

              <div className="px-4 py-3 border-t border-[var(--color-border-default)] bg-[var(--color-bg-hover)] text-center">
                <button className="text-[13px] leading-none font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400">
                  管理知识库
                </button>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={onToggleTheme}
          title={theme === 'light' ? '切换到暗色模式' : '切换到亮色模式'}
          className="flex items-center justify-center w-10 h-10 rounded-none text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-all cursor-pointer"
        >
          {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
        </button>

        <button
          onClick={() => setIsSettingsOpen(true)}
          title="系统设置"
          className="flex items-center justify-center w-10 h-10 rounded-none text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-all cursor-pointer"
        >
          <Settings size={17} />
        </button>
      </div>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </header>
  );
}
