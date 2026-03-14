import { useState, useRef } from 'react';
import { File, Database, AlertCircle, CheckCircle2, Loader2, Upload } from 'lucide-react';
import { getLLMSettings } from '../lib/llm';
import { apiUrl, ensureApiAvailable } from '../lib/config';

interface KnowledgeBaseProps {
    onUploadComplete?: (file: File) => void;
}

export default function KnowledgeBase({ onUploadComplete }: KnowledgeBaseProps) {
    const [file, setFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [statusMessage, setStatusMessage] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setUploadStatus('idle');
            setStatusMessage('');
        }
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            setFile(e.dataTransfer.files[0]);
            setUploadStatus('idle');
            setStatusMessage('');
        }
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
    };

    const handleUpload = async () => {
        if (!file) return;

        setIsUploading(true);
        setUploadStatus('idle');
        setStatusMessage('正在解析文档并切片向量化...');

        try {
            ensureApiAvailable('Knowledge Base');
            const formData = new FormData();
            formData.append('file', file);

            // 获取用户配置好的 Embedding 设置用来切片
            const llmConf = getLLMSettings();

            const res = await fetch(apiUrl('/api/kb/upload'), {
                method: 'POST',
                headers: {
                    'x-embedding-url': llmConf.embeddingBaseUrl,
                    'x-embedding-key': llmConf.embeddingApiKey,
                    'x-embedding-model': llmConf.embeddingModelName
                },
                body: formData
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || '上传失败');
            }

            setUploadStatus('success');
            setStatusMessage(`已成功录入知识库！共切片 ${data.chunks} 块。`);
            if (onUploadComplete) {
                onUploadComplete(file);
            }
            setFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        } catch (err: any) {
            console.error(err);
            setUploadStatus('error');
            setStatusMessage(`错误: ${err.message}`);
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="flex-1 flex flex-col p-6 animate-in fade-in slide-in-from-bottom-2 duration-300 h-full overflow-y-auto w-full">
            <div className="flex items-center gap-3 mb-8">
                <div className="p-2.5 bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)] rounded-xl border border-[var(--color-accent-primary)]/20 shadow-sm">
                    <Database size={24} />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">知识库 (Knowledge Space)</h1>
                    <p className="text-[14px] text-[var(--color-text-secondary)] mt-1 font-medium">
                        上传 PDF, Word, 或 TXT 文档，构建您的 RAG 专属智库
                    </p>
                </div>
            </div>

            <div className="max-w-2xl bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border-default)] shadow-sm p-6 max-h-min">
                <h3 className="text-[16px] font-bold text-[var(--color-text-primary)] mb-4">上传文档</h3>

                <div
                    onClick={() => !file && !isUploading && fileInputRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center transition-all ${file ? 'border-[var(--color-border-default)] bg-[var(--color-bg-input)]' : 'border-[var(--color-border-strong)] hover:border-[var(--color-accent-primary)] bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-hover)] cursor-pointer'
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
                            <div className="w-14 h-14 bg-[var(--color-bg-primary)] rounded-full flex items-center justify-center mb-4 shadow-sm border border-[var(--color-border-default)]">
                                <Upload size={24} className="text-[var(--color-text-tertiary)]" />
                            </div>
                            <p className="text-[15px] font-medium text-[var(--color-text-primary)]">点击或拖拽文件到这里上传</p>
                            <p className="text-[13px] text-[var(--color-text-tertiary)] mt-2">支持 .pdf, .docx, .txt (请配好向量模型设置)</p>
                        </>
                    ) : (
                        <div className="flex flex-col items-center">
                            <div className="w-16 h-16 bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)] rounded-2xl flex items-center justify-center mb-4 border border-[var(--color-accent-primary)]/20 shadow-sm">
                                <File size={32} />
                            </div>
                            <p className="text-[15px] font-semibold text-[var(--color-text-primary)] truncate max-w-[300px]">{file.name}</p>
                            <p className="text-[13px] text-[var(--color-text-tertiary)] mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>

                            <div className="flex gap-3 mt-6">
                                <button
                                    onClick={(e) => { e.stopPropagation(); setFile(null); setUploadStatus('idle'); setStatusMessage(''); }}
                                    disabled={isUploading}
                                    className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--color-text-secondary)] border border-[var(--color-border-strong)] hover:text-red-500 hover:border-red-500/50 hover:bg-red-50 dark:hover:bg-red-950/20 bg-white dark:bg-[#1a1a1a] transition-all disabled:opacity-50"
                                >
                                    移除
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleUpload(); }}
                                    disabled={isUploading}
                                    className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white bg-[var(--color-accent-primary)] hover:bg-[var(--color-accent-hover)] transition-all shadow-sm border border-transparent disabled:opacity-70 disabled:cursor-not-allowed"
                                >
                                    {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                                    开始录入向量库
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {uploadStatus === 'error' && (
                    <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg flex items-start gap-2">
                        <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                        <div className="text-sm text-red-600 dark:text-red-400 font-medium break-words leading-relaxed">
                            {statusMessage}
                        </div>
                    </div>
                )}

                {(uploadStatus === 'success' || (isUploading && statusMessage)) && (
                    <div className={`mt-4 p-3 rounded-lg flex items-start gap-2 border ${uploadStatus === 'success' ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900 text-green-600 dark:text-green-500' : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/50 text-blue-600 dark:text-blue-400'}`}>
                        {uploadStatus === 'success' ? <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" /> : <Loader2 size={16} className="animate-spin mt-0.5 flex-shrink-0" />}
                        <div className="text-sm font-medium leading-relaxed">
                            {statusMessage}
                        </div>
                    </div>
                )}
            </div>

            {/* Future list of uploaded docs could go here */}
        </div>
    );
}
