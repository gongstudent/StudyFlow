import { useState, useRef, useEffect } from 'react';
import type { RefObject } from 'react';
import { Lightbulb, FileText, Languages, Highlighter, PenTool, Check, X } from 'lucide-react';

interface SelectionToolbarProps {
  rect: DOMRect;
  containerRef: RefObject<HTMLElement | null>;
  onAction: (action: string, data?: string) => void;
}

export default function SelectionToolbar({
  rect,
  containerRef,
  onAction,
}: SelectionToolbarProps) {
  const [mode, setMode] = useState<'default' | 'note'>('default');
  const [noteContent, setNoteContent] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const container = containerRef.current;
  if (!container) return null;

  useEffect(() => {
    if (mode === 'note' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [mode]);

  const containerRect = container.getBoundingClientRect();

  // 计算浮窗位置 (在选区上方居中)
  const top = rect.top - containerRect.top + container.scrollTop - (mode === 'note' ? 120 : 44);
  const left = rect.left - containerRect.left + rect.width / 2;

  const handleAction = (key: string) => {
    if (key === '笔记') {
      setMode('note');
      return;
    }
    onAction(key);
  };

  const submitNote = () => {
    if (noteContent.trim()) {
      onAction('笔记', noteContent);
    }
    setMode('default');
    setNoteContent('');
  };

  const cancelNote = () => {
    setMode('default');
    setNoteContent('');
  };

  if (mode === 'note') {
    return (
      <div
        className="selection-toolbar absolute z-50 bg-[var(--color-bg-bubble-user)] rounded-lg shadow-lg p-2 flex flex-col gap-2 w-64"
        style={{ top: `${top}px`, left: `${left}px`, transform: 'translateX(-50%)' }}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <textarea
          ref={inputRef}
          value={noteContent}
          onChange={(e) => setNoteContent(e.target.value)}
          placeholder="写下你的想法..."
          className="w-full h-20 text-sm p-2 rounded bg-white/10 text-white placeholder-white/50 border-none outline-none resize-none"
          autoFocus={true}
          style={{ userSelect: 'text', cursor: 'text' }}
          onKeyDown={(e) => {
            e.stopPropagation(); // 再次确保
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submitNote();
            }
            if (e.key === 'Escape') {
              cancelNote();
            }
          }}
        />
        <div className="flex justify-end gap-2">
          <button onClick={cancelNote} className="p-1 hover:bg-white/10 rounded text-white/70">
            <X size={14} />
          </button>
          <button onClick={submitNote} className="p-1 hover:bg-white/10 rounded text-green-400">
            <Check size={14} />
          </button>
        </div>
      </div>
    );
  }

  const actions = [
    { key: '高亮', icon: Highlighter, label: '高亮', color: 'text-yellow-300' },
    { key: '笔记', icon: PenTool, label: '笔记', color: 'text-blue-300' },
    { key: 'divider', icon: null, label: '|' },
    { key: '解释', icon: Lightbulb, label: '解释' },
    { key: '总结', icon: FileText, label: '总结' },
    { key: '翻译', icon: Languages, label: '翻译' },
  ];

  return (
    <div
      className="selection-toolbar absolute z-50 flex items-center gap-0.5 bg-[var(--color-bg-bubble-user)] rounded-lg shadow-lg px-1 py-1"
      style={{ top: `${top}px`, left: `${left}px`, transform: 'translateX(-50%)' }}
      onMouseDown={(e) => {
        e.preventDefault(); // 防止按钮点击导致选区丢失
        e.stopPropagation();
      }}
      onMouseUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {actions.map(({ key, icon: Icon, label, color }, index) => {
        if (key === 'divider') {
          return <div key={`divider-${index}`} className="w-[1px] h-3 bg-white/20 mx-1" />;
        }

        return (
          <button
            key={key}
            onClick={() => handleAction(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-[var(--color-text-inverse)] hover:bg-white/10 rounded-md transition-colors whitespace-nowrap ${color || ''}`}
          >
            {Icon && <Icon size={13} />}
            {label}
          </button>
        );
      })}
    </div>
  );
}