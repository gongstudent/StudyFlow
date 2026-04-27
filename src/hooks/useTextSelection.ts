import { useEffect, useState } from 'react';

interface SelectionRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

interface SelectionState {
  text: string;
  isVisible: boolean;
  position: { x: number; y: number };
  rect: SelectionRect | null;
}

export const useTextSelection = (containerRef: React.RefObject<HTMLElement>) => {
  const [selectionState, setSelectionState] = useState<SelectionState>({
    text: '',
    isVisible: false,
    position: { x: 0, y: 0 },
    rect: null,
  });

  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();

      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        setSelectionState((prev) => ({ ...prev, isVisible: false, rect: null }));
        return;
      }

      const anchorNode = selection.anchorNode;
      if (containerRef.current && anchorNode && !containerRef.current.contains(anchorNode)) {
        setSelectionState((prev) => ({ ...prev, isVisible: false, rect: null }));
        return;
      }

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const normalizedRect: SelectionRect = {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };

      setSelectionState({
        text: selection.toString().trim(),
        isVisible: true,
        position: {
          x: rect.left + rect.width / 2,
          y: rect.top,
        },
        rect: normalizedRect,
      });
    };

    const handleMouseUp = () => {
      setTimeout(handleSelectionChange, 10);
    };

    const handleMouseDown = () => {
      setSelectionState((prev) => ({ ...prev, isVisible: false }));
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [containerRef]);

  return {
    ...selectionState,
    clearSelection: () => {
      setSelectionState((prev) => ({ ...prev, isVisible: false }));
      window.getSelection()?.removeAllRanges();
    },
  };
};
