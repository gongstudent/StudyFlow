import { useState, useEffect } from 'react';

interface SelectionState {
    text: string;
    isVisible: boolean;
    position: { x: number; y: number };
}

export const useTextSelection = (containerRef: React.RefObject<HTMLElement>) => {
    const [selectionState, setSelectionState] = useState<SelectionState>({
        text: '',
        isVisible: false,
        position: { x: 0, y: 0 }
    });

    useEffect(() => {
        const handleSelectionChange = () => {
            const selection = window.getSelection();

            // 1. 如果没有选中文本，或者是空的，隐藏菜单
            if (!selection || selection.isCollapsed || !selection.toString().trim()) {
                setSelectionState(prev => ({ ...prev, isVisible: false }));
                return;
            }

            // 2. 检查选区是否在容器内
            if (containerRef.current && !containerRef.current.contains(selection.anchorNode)) {
                setSelectionState(prev => ({ ...prev, isVisible: false }));
                return;
            }

            // 3. 获取选区坐标 (支持 PDF 的 span 层)
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            // 4. 更新状态 (位置在选区上方居中)
            setSelectionState({
                text: selection.toString().trim(),
                isVisible: true,
                position: {
                    x: rect.left + rect.width / 2,
                    y: rect.top - 40 // 向上偏移，避免挡住文字
                }
            });
        };

        // 使用 mouseup 也就是松开鼠标时触发，比 selectionchange 更节省性能
        // 但为了响应更及时，我们可以结合 selectionchange 做辅助，或者只用 mouseup
        // 这里采用 mouseup 以避免拖拽过程中的频繁闪烁
        const handleMouseUp = () => {
            // 延迟一点点，确保选区已经稳定
            setTimeout(handleSelectionChange, 10);
        };

        // 点击空白处隐藏
        const handleMouseDown = () => {
            setSelectionState(prev => ({ ...prev, isVisible: false }));
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
            setSelectionState(prev => ({ ...prev, isVisible: false }));
            window.getSelection()?.removeAllRanges();
        }
    };
};
