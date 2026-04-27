import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Document, Page, pdfjs } from 'react-pdf';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Loader2 } from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import SelectionToolbar from './SelectionToolbar';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFViewerProps {
  file: Blob | string;
}

interface SelectionRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export default function PDFViewer({ file }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [menuRect, setMenuRect] = useState<SelectionRect | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    bodyRef.current = document.body;
  }, []);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

  useEffect(() => {
    const handleJumpToPage = (e: Event) => {
      const { page } = (e as CustomEvent).detail;
      if (page) setPageNumber(page);
    };
    window.addEventListener('pdf-jump-to-page', handleJumpToPage);
    return () => window.removeEventListener('pdf-jump-to-page', handleJumpToPage);
  }, []);

  useEffect(() => {
    const handleScrollOrResize = (e: Event) => {
      if (e.target instanceof Element && e.target.closest('.selection-toolbar')) {
        return;
      }
      if (menuRect) {
        setMenuRect(null);
      }
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [menuRect]);

  const handleMouseUp = () => {
    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection?.toString().trim();
      if (!text) {
        setMenuRect(null);
        setSelectedText('');
        return;
      }

      const anchorNode = selection?.anchorNode;
      if (containerRef.current && anchorNode && !containerRef.current.contains(anchorNode)) {
        setMenuRect(null);
        setSelectedText('');
        return;
      }

      const range = selection?.getRangeAt(0);
      const rect = range?.getBoundingClientRect();
      if (!rect) return;

      setMenuRect({
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      });
      setSelectedText(text);
    }, 10);
  };

  return (
    <div className="flex flex-col h-full bg-gray-100 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 z-10 shadow-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
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
            onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
            disabled={pageNumber >= numPages}
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
            title="下一页"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setScale((s) => Math.max(0.5, s - 0.1))}
            className="p-1 rounded hover:bg-gray-100"
            title="缩小"
          >
            <ZoomOut size={18} />
          </button>
          <span className="text-sm w-12 text-center text-gray-600">{Math.round(scale * 100)}%</span>
          <button
            onClick={() => setScale((s) => Math.min(2.0, s + 0.1))}
            className="p-1 rounded hover:bg-gray-100"
            title="放大"
          >
            <ZoomIn size={18} />
          </button>
        </div>
      </div>

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
            loading={<div className="h-[800px] w-[600px] bg-white animate-pulse shadow-md" />}
          />
        </Document>

        {menuRect && selectedText && bodyRef.current &&
          createPortal(
            <SelectionToolbar
              rect={menuRect as DOMRect}
              containerRef={bodyRef as RefObject<HTMLElement>}
              onAction={(action, data) => {
                const event = new CustomEvent('pdf-select-action', {
                  detail: { action, text: selectedText, data, pageNumber },
                });
                window.dispatchEvent(event);
                setMenuRect(null);
                setSelectedText('');
                window.getSelection()?.removeAllRanges();
              }}
            />,
            bodyRef.current
          )}
      </div>
    </div>
  );
}
