import React, { useState, useCallback, useRef, useEffect } from 'react';

interface SplitPaneProps {
  left: React.ReactNode;
  right: React.ReactNode;
  /** 初始的左侧宽度百分比 (0-100) */
  defaultLeftPercent?: number;
  /** 左侧最小宽度 px */
  minLeftWidth?: number;
  /** 右侧最小宽度 px */
  minRightWidth?: number;
}

const STORAGE_KEY = 'studyflow-split-ratio';

export default function SplitPane({
  left,
  right,
  defaultLeftPercent = 60,
  minLeftWidth = 320,
  minRightWidth = 320,
}: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftPercent, setLeftPercent] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? parseFloat(saved) : defaultLeftPercent;
  });
  const [isDragging, setIsDragging] = useState(false);

  // 持久化分栏比例
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(leftPercent));
  }, [leftPercent]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const totalWidth = rect.width;
      const offsetX = e.clientX - rect.left;

      // 限制最小宽度
      const minLeftPercent = (minLeftWidth / totalWidth) * 100;
      const maxLeftPercent = ((totalWidth - minRightWidth) / totalWidth) * 100;

      const newPercent = Math.min(
        Math.max((offsetX / totalWidth) * 100, minLeftPercent),
        maxLeftPercent
      );

      setLeftPercent(newPercent);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // 拖拽时禁止选中文字
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging, minLeftWidth, minRightWidth]);

  return (
    <div ref={containerRef} className="flex flex-1 overflow-hidden relative">
      {/* 左侧面板 */}
      <div
        className="overflow-hidden flex flex-col bg-[var(--color-bg-card)] rounded-2xl shadow-sm border border-[var(--color-border-default)]"
        style={{ width: `calc(${leftPercent}% - 8px)` }}
      >
        {left}
      </div>

      {/* 分隔线与调整柄 (可拖拽区间 gap) */}
      <div
        className="relative flex items-center justify-center flex-shrink-0 w-4 cursor-col-resize z-10 group"
        onMouseDown={handleMouseDown}
      >
        <div className={`w-1 h-10 rounded-full transition-colors ${isDragging ? 'bg-[var(--color-accent-primary)]' : 'bg-transparent group-hover:bg-[var(--color-border-strong)]'
          }`} />
        {/* 更大的不可见拖拽热区 */}
        <div className="absolute inset-y-0 -left-2 -right-2" />
      </div>

      {/* 右侧面板 */}
      <div className="overflow-hidden flex flex-col flex-1 min-w-0 bg-[var(--color-bg-card)] rounded-2xl shadow-sm border border-[var(--color-border-default)]">
        {right}
      </div>
    </div>
  );
}