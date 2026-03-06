import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import type { Article } from '../types';

import { API_BASE_URL } from './config';

// ============================================================
// 代理地址配置
// 开发环境: Vite dev proxy '/api/proxy?url='
// 生产环境: 填入你的 CORS 代理地址，如 'https://your-worker.example.com/?url='
// ============================================================
const PROXY_BASE_URL = `${API_BASE_URL}/api/proxy?url=`;

/**
 * 抓取网页内容，提取正文并转换为 Markdown
 */
export async function fetchWebContent(url: string): Promise<Article> {
    // 1. 通过代理获取 HTML
    const html = await fetchHtmlViaProxy(url);

    // 2. 使用 Readability 提取正文
    const { title, content: articleHtml } = extractArticle(html, url);

    // 3. HTML → Markdown
    let markdown = htmlToMarkdown(articleHtml);

    // 4. 后处理：清理残留的噪声内容
    markdown = postCleanMarkdown(markdown);

    return {
        id: crypto.randomUUID(),
        url,
        title: title || extractTitleFallback(html) || new URL(url).hostname,
        content: markdown,
        fetchedAt: Date.now(),
    };
}

/**
 * 通过代理获取目标网页 HTML
 */
async function fetchHtmlViaProxy(url: string): Promise<string> {
    const proxyUrl = `${PROXY_BASE_URL}${encodeURIComponent(url)}`;

    const response = await fetch(proxyUrl, {
        headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
    });

    if (!response.ok) {
        throw new Error(`抓取失败: HTTP ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    if (!text || text.trim().length === 0) {
        throw new Error('抓取失败: 返回内容为空');
    }

    return text;
}

/**
 * 使用 Readability 提取文章正文
 */
function extractArticle(html: string, url: string): { title: string; content: string } {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 设置 base URL
    const base = doc.createElement('base');
    base.href = url;
    doc.head.prepend(base);

    // ======== 图片预处理：修复相对路径 + 懒加载 ========
    doc.querySelectorAll('img').forEach((img) => {
        // Step 1: 挖掘真实地址 (Anti-LazyLoad)
        const lazySrc = img.getAttribute('data-original-src')
            || img.getAttribute('data-src')
            || img.getAttribute('data-original')
            || img.getAttribute('data-lazy-src')
            || img.getAttribute('data-actualsrc')
            || img.getAttribute('data-url');
        if (lazySrc) {
            img.setAttribute('src', lazySrc);
        }

        // 从 data-srcset 中提取第一个 URL 作为兜底
        if (!img.getAttribute('src') || img.getAttribute('src') === '') {
            const dataSrcset = img.getAttribute('data-srcset') || img.getAttribute('srcset');
            if (dataSrcset) {
                const firstUrl = dataSrcset.split(',')[0]?.trim().split(/\s+/)[0];
                if (firstUrl) {
                    img.setAttribute('src', firstUrl);
                }
            }
        }

        // Step 2: 强制绝对路径化
        // DOMParser 创建的 detached document 中 img.src 不会自动解析
        // 必须使用 new URL() 手动拼接
        const rawSrc = img.getAttribute('src');
        if (rawSrc && !rawSrc.startsWith('data:')) {
            try {
                let absoluteUrl = new URL(rawSrc, url).href;

                // CSDN 特殊处理：移除 csdnimg.cn 的查询参数（避免鉴权/水印干扰）
                try {
                    const imgUrl = new URL(absoluteUrl);
                    if (imgUrl.hostname.includes('csdnimg.cn') || imgUrl.hostname.includes('csdn.net')) {
                        absoluteUrl = imgUrl.origin + imgUrl.pathname;
                    }
                } catch { /* ignore */ }

                img.setAttribute('src', absoluteUrl);
            } catch {
                // URL 解析失败则保留原值
            }
        }

        // Step 3: 清理干扰项
        img.removeAttribute('srcset');
        img.removeAttribute('data-srcset');
    });

    // 移除干扰元素（扩展列表）
    const removeSelectors = [
        'script', 'style', 'noscript', 'iframe',
        'nav', 'footer', 'header',
        '.sidebar', '.advertisement', '.ad', '.ads',
        '.social-share', '.share-buttons', '.comments',
        '.related-posts', '.related-articles',
        '.language-selector', '.lang-list', '.language-list',
        '[role="banner"]', '[role="navigation"]', '[role="complementary"]',
        '[role="contentinfo"]',
        // 常见页脚/导航类名
        '.footer-links', '.site-footer', '.page-footer',
        '.nav-links', '.breadcrumb', '.breadcrumbs',
        '.cookie-banner', '.newsletter-signup',
    ];
    removeSelectors.forEach((selector) => {
        doc.querySelectorAll(selector).forEach((el) => el.remove());
    });

    // 额外清洗：移除"密集链接列表"
    // 如果一个 <ul> 或 <ol> 中超过 70% 的子元素都是纯链接，判定为导航/语言列表
    doc.querySelectorAll('ul, ol').forEach((list) => {
        const items = list.querySelectorAll('li');
        if (items.length < 4) return; // 太少不处理

        let linkOnlyCount = 0;
        items.forEach((li) => {
            const links = li.querySelectorAll('a');
            const textLen = (li.textContent || '').trim().length;
            let linkTextLen = 0;
            links.forEach((a) => {
                linkTextLen += (a.textContent || '').trim().length;
            });
            // 如果 <li> 的绝大部分文字都在 <a> 中，则视为纯链接项
            if (links.length > 0 && textLen > 0 && linkTextLen / textLen > 0.8) {
                linkOnlyCount++;
            }
        });

        // 超过 70% 的项都是纯链接 → 移除整个列表
        if (linkOnlyCount / items.length > 0.7) {
            list.remove();
        }
    });

    const reader = new Readability(doc);
    const article = reader.parse();

    if (!article || !article.content) {
        throw new Error('内容提取失败: Readability 无法解析此页面');
    }

    return {
        title: article.title || '',
        content: article.content,
    };
}

/**
 * 将 HTML 转换为 Markdown
 */
function htmlToMarkdown(html: string): string {
    const turndown = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',   // ← 关键：强制 fenced 风格代码块
        bulletListMarker: '-',
        emDelimiter: '*',
        strongDelimiter: '**',
    });

    // ======== 保留富媒体标签（SVG/figure/iframe/img） ========
    // keep() 让 Turndown 原样输出这些标签的 HTML，而非转为文本
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    turndown.keep(['svg', 'figure', 'iframe', 'img'] as any);

    // 保留包含 SVG 或图表类名的 div 容器
    turndown.addRule('diagramContainer', {
        filter: (node) => {
            if (node.nodeName !== 'DIV') return false;
            const el = node as HTMLElement;
            // 包含 SVG 子元素
            if (el.querySelector('svg')) return true;
            // 图表相关类名
            const cls = el.getAttribute('class') || '';
            return /\b(graph|diagram|chart|mermaid|viz|figure|illustration)\b/i.test(cls);
        },
        replacement: (_content, node) => {
            const el = node as HTMLElement;
            return '\n\n' + el.outerHTML + '\n\n';
        },
    });

    // 强力代码块规则：拦截 <pre> 和 div.highlight，直接用 node.textContent
    turndown.addRule('fencedCodeBlock', {
        filter: (node) => {
            return (
                node.nodeName === 'PRE' ||
                (node.nodeName === 'DIV' && (node as HTMLElement).classList?.contains('highlight'))
            );
        },
        replacement: (content, node) => {
            const el = node as HTMLElement;
            let className = el.getAttribute('class') || '';
            const codeNode = el.querySelector('code');
            if (codeNode) {
                className += ' ' + (codeNode.getAttribute('class') || '');
            }

            let language = (
                className.match(/language-(\w+)/) ||
                className.match(/highlight-(\w+)/) ||
                []
            )[1] || '';

            // Python 文档启发式
            if (!language && (content.includes('def ') || content.includes('import ') || content.includes('class '))) {
                language = 'python';
            }

            // 暴力兜底：即使 language 为空也强制输出 fenced 代码块
            return '\n\n```' + language + '\n' + el.textContent!.trim() + '\n```\n\n';
        },
    });

    // 保留数学公式
    turndown.addRule('mathBlock', {
        filter: (node) => {
            const el = node as HTMLElement;
            return (
                el.classList?.contains('math') ||
                el.classList?.contains('katex') ||
                el.classList?.contains('MathJax') ||
                el.getAttribute('data-math') !== null
            );
        },
        replacement: (_content, node) => {
            const el = node as HTMLElement;
            const tex =
                el.getAttribute('data-math') ||
                el.querySelector('annotation[encoding="application/x-tex"]')?.textContent ||
                el.textContent ||
                '';
            const isBlock = el.tagName === 'DIV' || el.classList?.contains('math-display');
            return isBlock ? `\n\n$$\n${tex.trim()}\n$$\n\n` : `$${tex.trim()}$`;
        },
    });

    // 保留表格
    turndown.addRule('table', {
        filter: 'table',
        replacement: (_content, node) => {
            return `\n\n${tableToMarkdown(node as HTMLTableElement)}\n\n`;
        },
    });

    // 丢弃密集链接列表
    turndown.addRule('denseLinksFilter', {
        filter: (node) => {
            if (node.nodeName !== 'UL' && node.nodeName !== 'OL') return false;
            const el = node as HTMLElement;
            const items = el.querySelectorAll('li');
            if (items.length < 5) return false;

            let linkOnly = 0;
            items.forEach((li) => {
                const anchors = li.querySelectorAll('a');
                if (anchors.length > 0) {
                    const liText = (li.textContent || '').trim().length;
                    let anchorText = 0;
                    anchors.forEach((a) => (anchorText += (a.textContent || '').trim().length));
                    if (liText > 0 && anchorText / liText > 0.8) linkOnly++;
                }
            });

            return linkOnly / items.length > 0.7;
        },
        replacement: () => '',
    });

    let markdown = turndown.turndown(html);

    // 清理多余空行
    markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();

    return markdown;
}

/**
 * Markdown 后处理：清理残留噪声
 */
function postCleanMarkdown(md: string): string {
    let result = md;

    // 1. 移除连续 5+ 行都是短链接的区域
    //    匹配模式：每行只有 [xxx](url) 或 - [xxx](url) 且文本很短
    const lines = result.split('\n');
    const cleaned: string[] = [];
    let linkStreak: string[] = [];

    const isLinkOnlyLine = (line: string): boolean => {
        const trimmed = line.trim();
        if (!trimmed) return false;
        // 行内只有链接，文本部分很短 (< 30 字符)
        const stripped = trimmed
            .replace(/^[-*]\s*/, '')       // 去掉列表标记
            .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')  // 去掉链接语法，保留文本
            .trim();
        const hasLink = /\[.*?\]\(.*?\)/.test(trimmed);
        return hasLink && stripped.length < 30;
    };

    for (const line of lines) {
        if (isLinkOnlyLine(line)) {
            linkStreak.push(line);
        } else {
            if (linkStreak.length >= 5) {
                // 丢弃这批密集链接行
                linkStreak = [];
            } else {
                // 连续链接不够多，保留
                cleaned.push(...linkStreak);
                linkStreak = [];
            }
            cleaned.push(line);
        }
    }
    // 处理尾部
    if (linkStreak.length < 5) {
        cleaned.push(...linkStreak);
    }

    result = cleaned.join('\n');

    // 2. 清理多余空行
    result = result.replace(/\n{3,}/g, '\n\n').trim();

    return result;
}

/**
 * HTML <table> → Markdown 表格
 */
function tableToMarkdown(table: HTMLTableElement): string {
    const rows: string[][] = [];

    table.querySelectorAll('tr').forEach((tr) => {
        const cells: string[] = [];
        tr.querySelectorAll('th, td').forEach((cell) => {
            cells.push((cell.textContent || '').trim().replace(/\|/g, '\\|'));
        });
        if (cells.length > 0) rows.push(cells);
    });

    if (rows.length === 0) return '';

    const colCount = Math.max(...rows.map((r) => r.length));

    const normalized = rows.map((r) => {
        while (r.length < colCount) r.push('');
        return r;
    });

    const header = `| ${normalized[0].join(' | ')} |`;
    const separator = `| ${normalized[0].map(() => '---').join(' | ')} |`;
    const body = normalized
        .slice(1)
        .map((r) => `| ${r.join(' | ')} |`)
        .join('\n');

    return [header, separator, body].filter(Boolean).join('\n');
}

/**
 * 降级方案：从 <title> 标签提取标题
 */
function extractTitleFallback(html: string): string {
    const match = html.match(/<title[^>]*>(.*?)<\/title>/i);
    return match ? match[1].trim() : '';
}
