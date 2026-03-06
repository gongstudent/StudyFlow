import { useState, useCallback, useRef, useEffect } from 'react';
import { API_BASE_URL } from './lib/config';
import { Loader2 } from 'lucide-react';
import TopBar from './components/TopBar';
import SplitPane from './components/SplitPane';
import ReaderPane from './components/ReaderPane';
import AISidebar from './components/AISidebar';
import { fetchWebContent } from './lib/scraper';
import { streamChat } from './lib/chat';
import { saveArticle as dbSaveArticle, getAllArticles as dbGetAllArticles, deleteArticle as dbDeleteArticle, saveChatSession, getChatSession, updateArticleTags } from './lib/db';
import { useTheme } from './hooks/useTheme';
import { getSettings } from './lib/settings';
import type { Article, ChatMessage, SidebarMode } from './types';

type ViewMode = 'original' | 'translated';
const GITHUB_MODELS_URL = 'https://models.inference.ai.azure.com/chat/completions';

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [currentArticle, setCurrentArticle] = useState<Article | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('chat');
  const [isFetching, setIsFetching] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [savedArticles, setSavedArticles] = useState<Article[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // 翻译相关状态
  const [originalContent, setOriginalContent] = useState<string | null>(null);
  const [translatedContent, setTranslatedContent] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('original');
  const [isTranslating, setIsTranslating] = useState(false);

  // 用 ref 跟踪最新的 messages
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  // ======== 启动时从 IndexedDB 加载历史文章 ========
  useEffect(() => {
    dbGetAllArticles().then((articles) => {
      if (articles.length > 0) {
        setSavedArticles(articles);
      }
    }).catch(console.error);
  }, []);

  // ======== 异步 AI 打标 ========
  const fetchArticleTags = useCallback(async (article: Article) => {
    try {
      const settings = getSettings();
      const isGithub = settings.aiProvider === 'github';
      if (isGithub && !settings.githubToken) return;

      let tags: string[] = [];

      if (isGithub) {
        const resp = await fetch(GITHUB_MODELS_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.githubToken}`
          },
          body: JSON.stringify({
            messages: [
              { role: 'system', content: 'You are a helpful assistant that extracts exactly 3-5 core technical tags from the given text.' },
              { role: 'user', content: `Extract tags for this article. Title: ${article.title}\nContent: ${article.content.substring(0, 3000)}\nReturn ONLY a JSON array of strings like ["tag1", "tag2"]. No markdown formatting.` }
            ],
            model: 'gpt-4o-mini',
            temperature: 0.1
          })
        });
        if (!resp.ok) return;
        const data = await resp.json();
        try {
          const content = data.choices[0].message.content.replace(/```json\n?/, '').replace(/```\n?/, '');
          tags = JSON.parse(content);
        } catch {
          return;
        }
      } else {
        const resp = await fetch(`${API_BASE_URL}/api/tags`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: article.title, content: article.content.substring(0, 3000) }),
        });
        if (!resp.ok) return;
        const data = await resp.json();
        tags = data.tags;
      }

      if (tags && tags.length > 0) {
        // limit to 5
        tags = tags.slice(0, 5);
        await updateArticleTags(article.id, tags);
        setSavedArticles((prev) =>
          prev.map((a) => (a.id === article.id ? { ...a, tags } : a))
        );
      }
    } catch {
      // 打标失败不影响主流程
      console.warn('[tags] AI 打标失败，跳过');
    }
  }, []);

  // 抓取 URL
  const handleFetchUrl = useCallback(async (url: string) => {
    setIsFetching(true);
    setErrorMsg(null);
    try {
      const article = await fetchWebContent(url);
      setCurrentArticle(article);

      // 备份原文 + 重置翻译状态
      setOriginalContent(article.content);
      setTranslatedContent(null);
      setViewMode('original');

      // 持久化到 IndexedDB
      await dbSaveArticle(article);

      setSavedArticles((prev) => {
        const exists = prev.find((a) => a.url === article.url);
        if (exists) return prev;
        return [article, ...prev];
      });

      // 异步后台 AI 打标（不阻塞主流程）
      fetchArticleTags(article);

      const systemMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'system',
        content: `你是一个专业的学习助手。用户正在阅读以下文章，请基于文章内容回答用户的问题。回答时请使用中文，若涉及代码请使用 Markdown 代码块。\n\n---\n${article.content}\n---`,
        timestamp: Date.now(),
      };

      setMessages([systemMsg]);
      messagesRef.current = [systemMsg];
      setSidebarMode('chat');
    } catch (err) {
      const message = err instanceof Error ? err.message : '抓取失败，请检查 URL 是否正确';
      setErrorMsg(message);
      console.error('抓取失败:', err);
      setTimeout(() => setErrorMsg(null), 5000);
    } finally {
      setIsFetching(false);
    }
  }, []);

  // 翻译/切换原文
  const handleToggleTranslate = useCallback(async () => {
    if (isTranslating || !currentArticle || !originalContent) return;

    // 如果已有翻译结果 → 直接切换视图（毫秒级）
    if (translatedContent) {
      const nextMode = viewMode === 'original' ? 'translated' : 'original';
      setViewMode(nextMode);
      setCurrentArticle({
        ...currentArticle,
        content: nextMode === 'translated' ? translatedContent : originalContent,
      });
      return;
    }

    // 首次翻译 → 调用翻译 API
    setIsTranslating(true);
    setStatusMsg('正在启动【长文稳定翻译模式】。全篇翻译可能需要一些时间，请耐心等待...');
    setErrorMsg(null);

    try {
      const settings = getSettings();
      const isGithub = settings.aiProvider === 'github';

      if (isGithub && !settings.githubToken) {
        throw new Error('请先在"设置"中配置 GitHub Personal Access Token');
      }

      let translated = '';

      if (isGithub) {
        // GitHub Models Translation (Note: context length might be limited for very long articles)
        const resp = await fetch(GITHUB_MODELS_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.githubToken}`
          },
          body: JSON.stringify({
            messages: [
              { role: 'system', content: 'You are a professional translator. Translate the following markdown text into elegant fluent 中文. Preserve all markdown formatting, links, and code blocks exactly.' },
              { role: 'user', content: originalContent }
            ],
            model: 'gpt-4o-mini',
            temperature: 0.3
          })
        });
        if (!resp.ok) {
          const errText = await resp.text().catch(() => '');
          if (resp.status === 401) throw new Error('GitHub Token 无效或已过期');
          throw new Error(`翻译失败: HTTP ${resp.status} ${errText}`);
        }
        const data = await resp.json();
        translated = data.choices?.[0]?.message?.content || '';
      } else {
        // 本地 Ollama 代理流式拆分翻译
        const response = await fetch(`${API_BASE_URL}/api/translate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: originalContent,
            targetLanguage: '中文',
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
          throw new Error(errData.error || `翻译失败: HTTP ${response.status}`);
        }

        const data = await response.json();
        translated = data.translatedContent;
      }

      if (!translated) {
        throw new Error('翻译结果为空');
      }

      setTranslatedContent(translated);
      setViewMode('translated');
      setCurrentArticle({
        ...currentArticle,
        content: translated,
      });
      // 翻译成功，清除提示
      setStatusMsg(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : '翻译失败';
      setErrorMsg(message);
      setStatusMsg(null); // 出错也清除提示
      console.error('翻译失败:', err);
      // 错误提示保留久一点
      setTimeout(() => setErrorMsg(null), 8000);
    } finally {
      setIsTranslating(false);
    }
  }, [isTranslating, currentArticle, originalContent, translatedContent, viewMode]);

  // 发送聊天消息（流式）
  const handleSendMessage = useCallback(
    async (content: string) => {
      if (isStreaming) return;

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        timestamp: Date.now(),
      };

      const aiMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      };

      const newMessages = [...messagesRef.current, userMsg];
      setMessages([...newMessages, aiMsg]);
      messagesRef.current = [...newMessages, aiMsg];

      setIsStreaming(true);

      await streamChat(
        newMessages,
        (text) => {
          aiMsg.content += text;
          setMessages((prev) =>
            prev.map((m) => (m.id === aiMsg.id ? { ...m, content: aiMsg.content } : m))
          );
        },
        () => {
          setIsStreaming(false);
          const finalMessages = [...newMessages, { ...aiMsg }];
          messagesRef.current = finalMessages;
          // 持久化聊天记录
          if (currentArticle) {
            saveChatSession(currentArticle.id, finalMessages).catch(console.error);
          }
        },
        (error) => {
          aiMsg.content += `\n\n⚠️ 错误: ${error}`;
          setMessages((prev) =>
            prev.map((m) => (m.id === aiMsg.id ? { ...m, content: aiMsg.content } : m))
          );
          setIsStreaming(false);
        }
      );
    },
    [isStreaming]
  );

  // 划词选中文本 → 发送到对话
  const handleSelectText = useCallback(
    (text: string) => {
      handleSendMessage(text);
      setSidebarMode('chat');
    },
    [handleSendMessage]
  );

  // 加载历史文章（+ 恢复聊天记录）
  const handleLoadArticle = useCallback(async (article: Article) => {
    setCurrentArticle(article);
    setOriginalContent(article.content);
    setTranslatedContent(null);
    setViewMode('original');

    // 尝试恢复之前的聊天记录
    const savedMessages = await getChatSession(article.id).catch(() => null);

    if (savedMessages && savedMessages.length > 0) {
      setMessages(savedMessages);
      messagesRef.current = savedMessages;
    } else {
      const systemMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'system',
        content: `你是一个专业的学习助手。用户正在阅读以下文章，请基于文章内容回答用户的问题。回答时请使用中文，若涉及代码请使用 Markdown 代码块。\n\n---\n${article.content}\n---`,
        timestamp: Date.now(),
      };
      setMessages([systemMsg]);
      messagesRef.current = [systemMsg];
    }
    setSidebarMode('chat');
  }, []);

  // 删除历史文章（IndexedDB + 内存同步清理）
  const handleDeleteArticle = useCallback((id: string) => {
    dbDeleteArticle(id).catch(console.error);
    setSavedArticles((prev) => prev.filter((a) => a.id !== id));
    setCurrentArticle((curr) => (curr?.id === id ? null : curr));
  }, []);

  // 处理本地文件导入
  const handleFileUpload = useCallback(async (file: File) => {
    if (!file) return;

    setIsFetching(true); // 复用 loading 状态
    setErrorMsg(null);

    try {
      // 动态导入解析器 (Code splitting)
      const { parseFile } = await import('./lib/fileParser');
      const text = await parseFile(file);

      const ext = file.name.split('.').pop()?.toLowerCase();
      const title = file.name.replace(/\.(md|txt|pdf|docx)$/i, '');
      const timestamp = Date.now();

      let fileType: Article['fileType'];
      if (ext === 'pdf') fileType = 'pdf';
      else if (ext === 'docx') fileType = 'docx';
      else if (ext === 'md') fileType = 'md';
      else fileType = 'txt';

      const article: Article = {
        id: crypto.randomUUID(),
        url: `local://${timestamp}/${file.name}`, // 伪协议 URL
        title: title,
        content: text,
        fetchedAt: timestamp,
        fileType,
        fileData: file, // 存储原始 Blob
      };

      setCurrentArticle(article);
      setOriginalContent(article.content);
      setTranslatedContent(null);
      setViewMode('original');

      // 持久化到 IndexedDB
      // 注意：IndexedDB 可能限制 Blob 大小，若过大可能需要单独处理
      await dbSaveArticle(article);

      setSavedArticles((prev) => [article, ...prev]);

      // 异步后台 AI 打标
      fetchArticleTags(article);

      // 初始化 AI 对话上下文
      const systemMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'system',
        content: `你是一个专业的学习助手。用户正在阅读本地文件 "${file.name}"，请基于文件内容回答用户的问题。回答时请使用中文。\n\n---\n${article.content}\n---`,
        timestamp: Date.now(),
      };

      setMessages([systemMsg]);
      messagesRef.current = [systemMsg];
      setSidebarMode('chat');
    } catch (err) {
      console.error('文件解析失败:', err);
      setErrorMsg(`解析失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setIsFetching(false);
    }
  }, []);

  // 更新文章 (高亮/笔记)
  const handleUpdateArticle = useCallback(async (updatedArticle: Article) => {
    // 1. 更新本地状态
    setCurrentArticle(updatedArticle);
    setSavedArticles((prev) =>
      prev.map((a) => (a.id === updatedArticle.id ? updatedArticle : a))
    );

    // 2. 持久化到 DB
    await dbSaveArticle(updatedArticle);
  }, []);

  return (
    <>
      <TopBar
        onFetchUrl={handleFetchUrl}
        onFileUpload={handleFileUpload}
        isFetching={isFetching}
        hasArticle={!!currentArticle}
        articleContent={currentArticle?.content || ''}
        viewMode={viewMode}
        isTranslating={isTranslating}
        onToggleTranslate={handleToggleTranslate}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* 状态提示 (蓝色) - 长时间显示 */}
      {statusMsg && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 border-b border-blue-200 text-[13px] text-blue-700 animate-in slide-in-from-top-2">
          <Loader2 size={14} className="animate-spin" />
          <span className="font-medium">{statusMsg}</span>
        </div>
      )}

      {/* 错误提示 (红色) */}
      {errorMsg && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 border-b border-red-200 text-[13px] text-red-700 animate-in slide-in-from-top-2">
          <span className="font-medium">⚠</span>
          <span>{errorMsg}</span>
          <button
            onClick={() => setErrorMsg(null)}
            className="ml-auto text-red-400 hover:text-red-600 text-[12px]"
          >
            关闭
          </button>
        </div>
      )}

      <SplitPane
        left={
          <ReaderPane
            article={currentArticle}
            onSelectText={handleSelectText}
            onUpdateArticle={handleUpdateArticle}
          />
        }
        right={
          <AISidebar
            messages={messages}
            onSendMessage={handleSendMessage}
            sidebarMode={sidebarMode}
            onSwitchMode={setSidebarMode}
            savedArticles={savedArticles}
            onLoadArticle={handleLoadArticle}
            onDeleteArticle={handleDeleteArticle}
            currentArticle={currentArticle}
            onUpdateArticle={handleUpdateArticle}
            isStreaming={isStreaming}
          />
        }
      />
    </>
  );
}