import { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Database, File, Loader2, Upload } from 'lucide-react';
import { getLLMSettings } from '../lib/llm';
import { apiUrl, ensureApiAvailable } from '../lib/config';

interface KnowledgeBaseProps {
  onUploadComplete?: (file: File) => void;
}

function formatUploadError(rawMessage: string): string {
  const msg = String(rawMessage || '');
  const lower = msg.toLowerCase();
  if (msg.includes('QDRANT_UNAVAILABLE') || msg.includes('Qdrant is not reachable')) {
    return '向量数据库 Qdrant 未启动，请先启动 Docker 中的 Qdrant 服务（默认端口 6333）。';
  }
  if (msg.includes('Unable to extract text from file')) {
    return '无法从文档中提取文本，请确认文件不是空白扫描件，并且内容可复制。';
  }
  if (msg.includes('Uploaded file is empty')) {
    return '文件为空，请选择有内容的文件后再上传。';
  }
  if (
    lower.includes('failed to fetch') ||
    lower.includes('fetch failed') ||
    lower.includes('econnrefused') ||
    lower.includes('err_connection_refused')
  ) {
    return '无法连接后端 API（http://localhost:3000）。请先启动 `npm run server`，并保持该终端不要关闭。';
  }
  return msg || '上传失败，请稍后重试。';
}

export default function KnowledgeBase({ onUploadComplete }: KnowledgeBaseProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetStatus = () => {
    setUploadStatus('idle');
    setStatusMessage('');
  };

  const clearSelectedFile = (shouldResetStatus = true) => {
    setFile(null);
    if (shouldResetStatus) resetStatus();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    setFile(e.target.files[0]);
    resetStatus();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!e.dataTransfer.files?.[0]) return;
    setFile(e.dataTransfer.files[0]);
    resetStatus();
  };

  const handleUpload = async () => {
    if (!file) return;
    if (!file.size) {
      setUploadStatus('error');
      setStatusMessage('文件为空，请选择有内容的文件后再上传。');
      return;
    }

    setIsUploading(true);
    setUploadStatus('idle');
    setStatusMessage('正在检查向量库并处理文档...');

    try {
      ensureApiAvailable('Knowledge Base');

      // Pre-check Qdrant so users get a fast, clear error.
      const health = await fetch(apiUrl('/api/kb/health'));
      if (!health.ok) {
        const healthData = await health.json().catch(() => ({} as any));
        throw new Error(healthData?.code || healthData?.error || 'QDRANT_UNAVAILABLE');
      }

      const formData = new FormData();
      formData.append('file', file);

      const llmConf = getLLMSettings();
      const res = await fetch(apiUrl('/api/kb/upload'), {
        method: 'POST',
        headers: {
          'x-embedding-url': llmConf.embeddingBaseUrl,
          'x-embedding-key': llmConf.embeddingApiKey,
          'x-embedding-model': llmConf.embeddingModelName,
        },
        body: formData,
      });

      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        throw new Error(data?.code || data?.error || `HTTP ${res.status}`);
      }

      setUploadStatus('success');
      setStatusMessage(`成功录入知识库，共切片 ${data?.chunks ?? 0} 块。`);
      onUploadComplete?.(file);
      clearSelectedFile(false);
    } catch (err: any) {
      setUploadStatus('error');
      setStatusMessage(`错误：${formatUploadError(err?.message || '')}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6 animate-in fade-in slide-in-from-bottom-2 duration-300 h-full overflow-y-auto w-full">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)] rounded-none border border-[var(--color-accent-primary)]/20 shadow-sm">
          <Database size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">知识库 (Knowledge Space)</h1>
          <p className="text-[14px] text-[var(--color-text-secondary)] mt-1 font-medium">
            上传 PDF、Word、TXT 文档，构建你的专属 RAG 知识库
          </p>
        </div>
      </div>

      <div className="max-w-2xl bg-[var(--color-bg-card)] rounded-none border border-[var(--color-border-default)] shadow-sm p-7 max-h-min">
        <h3 className="text-[16px] font-bold text-[var(--color-text-primary)] mb-4">上传文档</h3>

        <div
          onClick={() => !file && !isUploading && fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className={`border-2 border-dashed rounded-none p-12 flex flex-col items-center justify-center transition-all ${
            file
              ? 'border-[var(--color-border-default)] bg-[var(--color-bg-input)]'
              : 'border-[var(--color-border-strong)] hover:border-[var(--color-accent-primary)] bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-hover)] cursor-pointer'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept=".txt,.pdf,.docx"
          />

          {!file ? (
            <>
              <div className="w-14 h-14 bg-[var(--color-bg-primary)] rounded-none flex items-center justify-center mb-4 shadow-sm border border-[var(--color-border-default)]">
                <Upload size={24} className="text-[var(--color-text-tertiary)]" />
              </div>
              <p className="text-[15px] font-medium text-[var(--color-text-primary)]">点击或拖拽文件到这里上传</p>
              <p className="text-[13px] text-[var(--color-text-tertiary)] mt-2">支持 .pdf、.docx、.txt</p>
            </>
          ) : (
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)] rounded-none flex items-center justify-center mb-4 border border-[var(--color-accent-primary)]/20 shadow-sm">
                <File size={32} />
              </div>
              <p className="text-[15px] font-semibold text-[var(--color-text-primary)] truncate max-w-[300px]">{file.name}</p>
              <p className="text-[13px] text-[var(--color-text-tertiary)] mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    clearSelectedFile();
                  }}
                  disabled={isUploading}
                  className="px-5 py-2.5 rounded-none text-sm font-medium text-[var(--color-text-secondary)] border border-[var(--color-border-strong)] hover:text-red-500 hover:border-red-500/50 hover:bg-red-50 dark:hover:bg-red-950/20 bg-white dark:bg-[#1a1a1a] transition-all disabled:opacity-50"
                >
                  移除
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUpload();
                  }}
                  disabled={isUploading}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-none text-sm font-medium text-white bg-[var(--color-accent-primary)] hover:bg-[var(--color-accent-hover)] transition-all shadow-sm border border-transparent disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                  开始录入向量库
                </button>
              </div>
            </div>
          )}
        </div>

        {uploadStatus === 'error' && (
          <div className="mt-4 p-3.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-none flex items-start gap-2">
            <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-red-600 dark:text-red-400 font-medium break-words leading-relaxed">{statusMessage}</div>
          </div>
        )}

        {(uploadStatus === 'success' || (isUploading && statusMessage)) && (
          <div
            className={`mt-4 p-3.5 rounded-none flex items-start gap-2 border ${
              uploadStatus === 'success'
                ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900 text-green-600 dark:text-green-500'
                : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/50 text-blue-600 dark:text-blue-400'
            }`}
          >
            {uploadStatus === 'success' ? (
              <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" />
            ) : (
              <Loader2 size={16} className="animate-spin mt-0.5 flex-shrink-0" />
            )}
            <div className="text-sm font-medium leading-relaxed">{statusMessage}</div>
          </div>
        )}
      </div>
    </div>
  );
}
