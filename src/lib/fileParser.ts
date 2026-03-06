import * as pdfjsLib from 'pdfjs-dist';
// 注意：Worker 配置需指向正确的 CDN 或本地路径
// 这里使用 unpkg CDN，版本需与 package.json 中一致 (自动匹配最新版)
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

import mammoth from 'mammoth';

/**
 * 解析上传的文件内容
 * 支持: .md, .txt, .pdf, .docx
 */
export async function parseFile(file: File): Promise<string> {
    const ext = file.name.split('.').pop()?.toLowerCase();

    switch (ext) {
        case 'pdf':
            return await parsePdf(file);
        case 'docx':
            return await parseDocx(file);
        case 'md':
        case 'txt':
        default:
            return await parseText(file);
    }
}

/**
 * 解析普通文本 (.txt, .md)
 */
async function parseText(file: File): Promise<string> {
    return await file.text();
}

/**
 * 解析 PDF
 */
async function parsePdf(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    let fullText = '';
    // 遍历所有页
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
            .map((item: any) => item.str)
            .join(' ');
        fullText += pageText + '\n\n';
    }

    return fullText.trim();
}

/**
 * 解析 Word (.docx)
 */
async function parseDocx(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    if (result.messages.length > 0) {
        console.warn('Word 解析警告:', result.messages);
    }
    return result.value.trim();
}
