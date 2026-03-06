import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Document, Page, pdfjs } from 'react-pdf';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Loader2 } from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import SelectionToolbar from './SelectionToolbar';

// 设置 worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFViewerProps {
    file: Blob | string;
}

export default function PDFViewer({ file }: PDFViewerProps) {
    const [numPages, setNumPages] = useState<number>(0);
    const [pageNumber, setPageNumber] = useState(1);
    const [scale, setScale] = useState(1.0);

    // 独立管理 PDF 内的选区状态
    const [menuPosition, setMenuPosition] = useState<{ x: number, y: number } | null>(null);
    const [selectedText, setSelectedText] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

    function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
        setNumPages(numPages);
    }

    // 监听跳转页码事件
    useEffect(() => {
        const handleJumpToPage = (e: Event) => {
            const { page } = (e as CustomEvent).detail;
            console.log('PDFViewer received jump request:', page);
            if (page) setPageNumber(page);
        };
        window.addEventListener('pdf-jump-to-page', handleJumpToPage);
        return () => window.removeEventListener('pdf-jump-to-page', handleJumpToPage);
    }, []);

    // 监听滚动和调整大小，隐藏菜单以防错位
    useEffect(() => {
        const handleScrollOrResize = (e: Event) => {
            // 如果事件源是工具栏内部（例如 textarea 滚动），则忽略
            if (e.target instanceof Element && e.target.closest('.selection-toolbar')) {
                return;
            }

            if (menuPosition) {
                // 只有当真正发生页面级滚动或缩放时才隐藏
                // 这里加一个简单的防抖或判断可能是个好主意，但暂时先只过滤目标
                setMenuPosition(null);
            }
        };

        window.addEventListener('scroll', handleScrollOrResize, true); // 捕获阶段
        window.addEventListener('resize', handleScrollOrResize);

        return () => {
            window.removeEventListener('scroll', handleScrollOrResize, true);
            window.removeEventListener('resize', handleScrollOrResize);
        };
    }, [menuPosition]);

    // 处理 PDF 区域的鼠标松开事件
    const handleMouseUp = () => {
        // 稍微延迟，确保 window.getSelection() 已更新
        setTimeout(() => {
            const selection = window.getSelection();
            const text = selection?.toString().trim();

            if (!text) {
                setMenuPosition(null);
                setSelectedText('');
                return;
            }

            // 获取坐标
            const range = selection?.getRangeAt(0);
            const rect = range?.getBoundingClientRect();

            if (rect) {
                // 使用 Client 坐标，因为很多时候 PDF 会由自己的滚动容器
                // 使用 Portal 后，fixed 定位是相对于视口的，所以直接用 rect.left/top 即可
                setMenuPosition({
                    x: rect.left + rect.width / 2,
                    y: rect.top - 10 // 稍微向上偏移
                });
                setSelectedText(text);
            }
        }, 10);
    };

    return (
        <div className="flex flex-col h-full bg-gray-100 overflow-hidden">
            {/* 工具栏 */}
            <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 z-10 shadow-sm">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setPageNumber(p => Math.max(1, p - 1))}
                        disabled={pageNumber <= 1}
                        className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
                        title="上一页"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <span className="text-sm font-medium text-gray-600">
                        Page {pageNumber} of {numPages || '--'}
                    </span>
                    <button
                        onClick={() => setPageNumber(p => Math.min(numPages, p + 1))}
                        disabled={pageNumber >= numPages}
                        className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
                        title="下一页"
                    >
                        <ChevronRight size={20} />
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setScale(s => Math.max(0.5, s - 0.1))}
                        className="p-1 rounded hover:bg-gray-100"
                        title="缩小"
                    >
                        <ZoomOut size={18} />
                    </button>
                    <span className="text-sm w-12 text-center text-gray-600">
                        {Math.round(scale * 100)}%
                    </span>
                    <button
                        onClick={() => setScale(s => Math.min(2.0, s + 0.1))}
                        className="p-1 rounded hover:bg-gray-100"
                        title="放大"
                    >
                        <ZoomIn size={18} />
                    </button>
                </div>
            </div>

            {/* PDF 内容区 */}
            <div
                className="flex-1 overflow-auto relative bg-gray-200/50"
                onMouseUp={handleMouseUp}
                ref={containerRef}
            >
                <Document
                    file={file}
                    onLoadSuccess={onDocumentLoadSuccess}
                    onLoadError={(err) => console.error('PDF load error:', err)}
                    loading={
                        <div className="flex items-center justify-center h-full text-gray-500 gap-2">
                            <Loader2 className="animate-spin" /> 加载文档中...
                        </div>
                    }
                    className="flex flex-col items-center min-h-full py-8"
                >
                    <Page
                        pageNumber={pageNumber}
                        scale={scale}
                        renderTextLayer={true}
                        renderAnnotationLayer={true}
                        className="shadow-lg bg-white"
                        loading={
                            <div className="h-[800px] w-[600px] bg-white animate-pulse shadow-md" />
                        }
                    />
                </Document>

                {/* 悬浮菜单 (Portal 到 Body，确保不受父级 transform 影响) */}
                {menuPosition && selectedText && createPortal(
                    <div
                        style={{
                            position: 'fixed', // Portal 后相对于视口
                            left: menuPosition.x,
                            top: menuPosition.y,
                            zIndex: 9999,
                            transform: 'translate(-50%, -100%)', // 向上偏移自身高度
                            pointerEvents: 'auto'
                        }}
                    >
                        <SelectionToolbar
                            rect={{
                                left: menuPosition.x,
                                top: menuPosition.y,
                                width: 0,
                                height: 0,
                                right: menuPosition.x,
                                bottom: menuPosition.y,
                                toJSON: () => { }
                            } as DOMRect}
                            containerRef={{ current: document.body } as React.RefObject<HTMLElement>} // Portal 后在 body 上
                            onAction={(action, data) => {
                                console.log('PDF Action:', action, selectedText, data, pageNumber);
                                const event = new CustomEvent('pdf-select-action', {
                                    detail: { action, text: selectedText, data, pageNumber } // Pass pageNumber
                                });
                                window.dispatchEvent(event);

                                setMenuPosition(null);
                                setSelectedText('');
                                window.getSelection()?.removeAllRanges();
                            }}
                        />
                    </div>,
                    document.body
                )}
            </div>
        </div>
    );
}
