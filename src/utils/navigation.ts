
/**
 * 使用轮询机制查找并高亮文本，适应 PDF 的异步渲染特性
 * @param text 要查找的文本
 */
export const highlightAndScroll = (text: string) => {
    let attempts = 0;
    const maxAttempts = 50; // 50 * 100ms = 5秒超时

    // 清除可能存在的旧高亮
    const oldHighlights = document.querySelectorAll('.temp-highlight-span');
    oldHighlights.forEach(el => {
        const h = el as HTMLElement;
        h.style.backgroundColor = '';
        h.style.transition = '';
        h.classList.remove('temp-highlight-span');
    });

    const intervalId = setInterval(() => {
        attempts++;

        // 1. 获取所有潜在的文本容器
        // PDF 文本层通常在 .react-pdf__Page__textContent 中
        // Markdown 内容通常在 .markdown-body 中
        // 2. 遍历查找
        const pdfSpans = document.querySelectorAll('.react-pdf__Page__textContent span');
        const markdownElements = document.querySelectorAll('.markdown-body *');

        console.log(`[Polling attempt ${attempts}] Found ${pdfSpans.length} PDF spans, ${markdownElements.length} Markdown elements.`);

        // 合并搜索范围 (先搜 PDF，再搜 Markdown)
        const elementsToSearch = [...Array.from(pdfSpans), ...Array.from(markdownElements)];

        if (elementsToSearch.length === 0 && attempts < maxAttempts) {
            return; // DOM 可能还没渲染出来
        }

        // 2. 遍历查找
        for (const el of elementsToSearch) {
            // 简化匹配：只匹配前 30 个字符，忽略空白符差异
            // 这种模糊匹配能有效处理 PDF 换行符导致的文本断裂问题
            const elementText = el.textContent || '';
            const cleanElementText = elementText.replace(/\s+/g, '').trim();
            const cleanTargetText = text.replace(/\s+/g, '').trim().substring(0, 30);

            // 只有当元素包含目标文本(且不是太短的通用文本)时才匹配
            if (cleanTargetText.length > 5 && cleanElementText.includes(cleanTargetText)) {
                // 3. 找到了！清除定时器
                clearInterval(intervalId);

                // 4. 滚动到视野中心
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });

                // 5. 高亮动画
                const htmlEl = el as HTMLElement;
                const originalTransition = htmlEl.style.transition;
                const originalBg = htmlEl.style.backgroundColor;

                // 标记，方便下次清除
                htmlEl.classList.add('temp-highlight-span');

                // 立即应用高亮
                requestAnimationFrame(() => {
                    htmlEl.style.transition = 'background-color 0.3s ease';
                    htmlEl.style.backgroundColor = 'rgba(255, 235, 59, 0.8)'; // Yellow
                    htmlEl.style.borderRadius = '2px';
                    htmlEl.style.boxShadow = '0 0 0 2px rgba(255, 235, 59, 0.3)';
                });

                // 2秒后复原
                setTimeout(() => {
                    htmlEl.style.backgroundColor = originalBg;
                    htmlEl.style.boxShadow = 'none';
                    // 保留 transition 以便平滑淡出
                    setTimeout(() => {
                        htmlEl.style.transition = originalTransition;
                        htmlEl.classList.remove('temp-highlight-span');
                    }, 300);
                }, 2000);

                return;
            }
        }

        // 超时停止
        if (attempts >= maxAttempts) {
            clearInterval(intervalId);
            console.warn("Text not found in viewport after polling:", text);
        }
    }, 100); // 每 100ms 检查一次
};
