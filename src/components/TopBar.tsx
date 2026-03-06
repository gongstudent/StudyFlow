import { useState, useRef } from 'react';
import { Globe, ArrowRight, Loader2, BookOpen, Languages, FileText, ClipboardPaste, Wand2, Upload, Sun, Moon, Settings } from 'lucide-react';
import WriterModal from './WriterModal';
import SettingsModal from './SettingsModal';

// ... (CORS_PROXY_URL remains same)

interface TopBarProps {
  onFetchUrl: (url: string) => void;
  onFileUpload: (file: File) => void;
  isFetching: boolean;
  hasArticle?: boolean;
  articleContent?: string;
  viewMode?: 'original' | 'translated';
  isTranslating?: boolean;
  onToggleTranslate?: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export default function TopBar({
  onFetchUrl,
  onFileUpload,
  isFetching,
  hasArticle = false,
  articleContent = '',
  viewMode = 'original',
  isTranslating = false,
  onToggleTranslate,
  theme,
  onToggleTheme,
}: TopBarProps) {
  const [inputUrl, setInputUrl] = useState('');
  const [showWriter, setShowWriter] = useState(false);
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

  return (
    <header className="flex items-center h-[52px] border-b border-[var(--color-border-default)] bg-[var(--color-bg-primary)] flex-shrink-0 px-4">
      {/* ── 左侧：Logo + 操作组 ── */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* Logo */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-[var(--color-accent-primary)] flex items-center justify-center">
            <BookOpen size={16} className="text-white" />
          </div>
          <span className="font-semibold text-[15px] text-[var(--color-text-primary)] tracking-tight hidden sm:inline">
            StudyFlow
          </span>
        </div>

        {/* URL 输入框 + 抓取按钮 */}
        <form onSubmit={handleSubmit} className="flex-1 flex items-center max-w-2xl">
          <div className="flex items-center flex-1 bg-[var(--color-bg-input)] border border-[var(--color-border-default)] rounded-lg px-3 h-9 gap-2 focus-within:border-[var(--color-accent-primary)] focus-within:ring-2 focus-within:ring-[var(--color-accent-soft)] transition-all">

            {/* 上传按钮 (放在最左侧) */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="导入本地文件 (.md / .txt)"
              className="flex items-center justify-center w-7 h-7 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-accent-primary)] hover:bg-[var(--color-accent-soft)] transition-colors flex-shrink-0 cursor-pointer"
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
            {/* ... (rest of the form buttons) ... */}
            <button
              type="button"
              onClick={handlePasteAndFetch}
              disabled={isFetching}
              title="粘贴并抓取"
              className="flex items-center justify-center w-7 h-7 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-accent-primary)] hover:bg-[var(--color-accent-soft)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0 cursor-pointer"
            >
              <ClipboardPaste size={14} />
            </button>
            <button
              type="submit"
              disabled={isFetching || !inputUrl.trim()}
              className="flex items-center justify-center w-7 h-7 rounded-md bg-[var(--color-accent-primary)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0 cursor-pointer"
            >
              {isFetching ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <ArrowRight size={14} />
              )}
            </button>
          </div>
        </form>
      </div>

      {/* ── 右侧：视图切换组 ── */}
      {hasArticle && (
        <div className="flex items-center gap-2 ml-3 flex-shrink-0">
          {/* 分隔线 */}
          <div className="w-px h-6 bg-[var(--color-border-default)]" />

          <button
            onClick={onToggleTranslate}
            disabled={isTranslating}
            title={isTranslating ? '翻译中...' : viewMode === 'translated' ? '切换到原文' : 'AI 翻译为中文'}
            className={`flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-[13px] font-medium transition-all cursor-pointer ${viewMode === 'translated'
              ? 'bg-[var(--color-accent-primary)] text-white hover:bg-[var(--color-accent-hover)]'
              : 'bg-[var(--color-bg-input)] border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-accent-primary)]'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isTranslating ? (
              <Loader2 size={14} className="animate-spin" />
            ) : viewMode === 'translated' ? (
              <FileText size={14} />
            ) : (
              <Languages size={14} />
            )}
            <span className="hidden md:inline">
              {isTranslating ? 'AI 深度翻译中...' : viewMode === 'translated' ? '原文' : 'AI 深度翻译'}
            </span>
          </button>

          {/* AI 写作 */}
          <button
            onClick={() => setShowWriter(true)}
            title="AI 写作助手"
            className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-[13px] font-medium cursor-pointer transition-all bg-[var(--color-bg-input)] border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-accent-primary)]"
          >
            <Wand2 size={14} />
            <span className="hidden md:inline">写作</span>
          </button>


          {/* 分隔线 */}
          <div className="w-px h-4 bg-[var(--color-border-default)] mx-1" />

          {/* 设置按钮 */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            title="设置"
            className="flex items-center justify-center w-8 h-8 rounded-lg text-[var(--color-text-tertiary)] hover:text-[var(--color-accent-primary)] hover:bg-[var(--color-accent-soft)] transition-colors cursor-pointer"
          >
            <Settings size={16} />
          </button>

          {/* 主题切换 */}
          <button
            onClick={onToggleTheme}
            title={theme === 'light' ? '切换到晚间模式' : '切换到早间模式'}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-[var(--color-text-tertiary)] hover:text-[var(--color-accent-primary)] hover:bg-[var(--color-accent-soft)] transition-colors cursor-pointer"
          >
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
        </div>
      )}

      {/* Writer Modal */}
      {showWriter && hasArticle && (
        <WriterModal
          articleContent={articleContent}
          onClose={() => setShowWriter(false)}
        />
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </header>
  );
}