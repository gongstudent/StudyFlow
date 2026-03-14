import { useState, useCallback, useRef, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import TopBar from './components/TopBar';
import SplitPane from './components/SplitPane';
import ReaderPane from './components/ReaderPane';
import AISidebar from './components/AISidebar';
import HistoryDrawer from './components/HistoryDrawer';
import KnowledgeBase from './components/KnowledgeBase';
import { fetchWebContent } from './lib/scraper';
import { streamChat, streamKnowledgeBaseChat } from './lib/chat';
import { saveArticle as dbSaveArticle, getAllArticles as dbGetAllArticles, deleteArticle as dbDeleteArticle, saveChatSession, getChatSession, updateArticleTags } from './lib/db';
import { getLLMSettings } from './lib/llm';
import { apiUrl, ensureApiAvailable } from './lib/config';
import { useTheme } from './hooks/useTheme';
import type { Article, ChatMessage } from './types';

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [currentArticle, setCurrentArticle] = useState<Article | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [savedArticles, setSavedArticles] = useState<Article[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'reader' | 'knowledge'>('reader');
  const [chatMode, setChatMode] = useState<'article' | 'knowledge'>('article');

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
      const messages = [
        { role: 'system', content: 'You are a helpful assistant that extracts exactly 3-5 core technical tags from the given text.' },
        { role: 'user', content: `Extract tags for this article. Title: ${article.title}\nContent: ${article.content.substring(0, 3000)}\nReturn ONLY a JSON array of strings like ["tag1", "tag2"]. No markdown formatting.` }
      ];

      const { fetchLLMResponse } = await import('./lib/llm');
      const responseText = await fetchLLMResponse(messages);

      let tags: string[] = [];
      try {
        const content = responseText.replace(/```json\n?/, '').replace(/```\n?/, '');
        tags = JSON.parse(content);
      } catch {
        return; // JSON parses fault, ignore
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
        id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2),
        role: 'system',
        content: `你是一个专业的学习助手。用户正在阅读以下文章，请基于文章内容回答用户的问题。回答时请使用中文，若涉及代码请使用 Markdown 代码块。\n\n---\n${article.content}\n---`,
        timestamp: Date.now(),
      };

      setMessages([systemMsg]);
      messagesRef.current = [systemMsg];
    } catch (err) {
      const message = err instanceof Error ? err.message : '抓取失败，请检查 URL 是否正确';
      setErrorMsg(message);
      console.error('抓取失败:', err);
      setTimeout(() => setErrorMsg(null), 5000);
    } finally {
      setIsFetching(false);
    }
  }, []);

  // 发送聊天消息（流式）
  const handleSendMessage = useCallback(
    async (content: string) => {
      if (isStreaming) return;

      const userMsg: ChatMessage = {
        id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2),
        role: 'user',
        content,
        timestamp: Date.now(),
      };

      const aiMsg: ChatMessage = {
        id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      };

      const newMessages = [...messagesRef.current, userMsg];
      setMessages([...newMessages, aiMsg]);
      messagesRef.current = [...newMessages, aiMsg];

      setIsStreaming(true);

      const streamFunction = chatMode === 'knowledge' ? streamKnowledgeBaseChat : streamChat;

      await streamFunction(
        newMessages,
        (text: string) => {
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
        (error: string) => {
          aiMsg.content += `\n\n⚠️ 错误: ${error}`;
          setMessages((prev) =>
            prev.map((m) => (m.id === aiMsg.id ? { ...m, content: aiMsg.content } : m))
          );
          setIsStreaming(false);
        }
      );
    },
    [isStreaming, activeTab, currentArticle]
  );

  // 划词选中文本 → 发送到对话
  const handleSelectText = useCallback(
    (text: string) => {
      handleSendMessage(text);
      setIsHistoryOpen(false); // 若历史记录开着，则关闭
    },
    [handleSendMessage]
  );

  // 加载历史文章（+ 恢复聊天记录）
  const handleLoadArticle = useCallback(async (article: Article) => {
    setCurrentArticle(article);

    // 尝试恢复之前的聊天记录
    const savedMessages = await getChatSession(article.id).catch(() => null);

    if (savedMessages && savedMessages.length > 0) {
      setMessages(savedMessages);
      messagesRef.current = savedMessages;
    } else {
      const systemMsg: ChatMessage = {
        id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2),
        role: 'system',
        content: `你是一个专业的学习助手。用户正在阅读以下文章，请基于文章内容回答用户的问题。回答时请使用中文，若涉及代码请使用 Markdown 代码块。\n\n---\n${article.content}\n---`,
        timestamp: Date.now(),
      };
      setMessages([systemMsg]);
      messagesRef.current = [systemMsg];
    }
  }, []);

  // 删除历史文章（IndexedDB + 内存同步清理）
  const handleDeleteArticle = useCallback((id: string) => {
    dbDeleteArticle(id).catch(console.error);
    setSavedArticles((prev) => prev.filter((a) => a.id !== id));
    setCurrentArticle((curr) => (curr?.id === id ? null : curr));
  }, []);

  // 添加到知识库
  const handleAddToKB = useCallback(async (article: Article) => {
    try {
      ensureApiAvailable('Knowledge Base');
      setStatusMsg(`正在将 "${article.title}" 录入知识库...`);
      const llmConf = getLLMSettings();

      const blob = new Blob([article.content], { type: 'text/plain' });
      // 生成 txt 文件名（去掉可能的非法字符）
      const safeTitle = article.title.replace(/[\\/:*?"<>|]/g, '_') || 'article';
      const file = new File([blob], `${safeTitle}.txt`, { type: 'text/plain' });

      const formData = new FormData();
      formData.append('file', file);

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

      // 更新状态并持久化
      const updatedArticle = { ...article, isSavedToKB: true };
      await dbSaveArticle(updatedArticle);
      setSavedArticles((prev) => prev.map((a) => (a.id === article.id ? updatedArticle : a)));
      if (currentArticle?.id === article.id) {
        setCurrentArticle(updatedArticle);
      }

      setStatusMsg(`✅ 成功录入 "${article.title}" 到知识库`);
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(`录入知识库失败: ${e.message}`);
    } finally {
      setIsHistoryOpen(false); // 关闭侧边栏
    }
  }, [currentArticle]);

  // 从知识库移除
  const handleRemoveFromKB = useCallback(async (article: Article) => {
    try {
      ensureApiAvailable('Knowledge Base');
      setStatusMsg(`正在从知识库移除 "${article.title}"...`);
      const safeTitle = article.title.replace(/[\\/:*?"<>|]/g, '_') || 'article';
      const source = `${safeTitle}.txt`;

      const res = await fetch(apiUrl('/api/kb/delete'), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '移除失败');
      }

      // 更新状态并持久化 (只是取消入库标记，不删除原文)
      const updatedArticle = { ...article, isSavedToKB: false };
      await dbSaveArticle(updatedArticle);
      setSavedArticles((prev) => prev.map((a) => (a.id === article.id ? updatedArticle : a)));
      if (currentArticle?.id === article.id) {
        setCurrentArticle(updatedArticle);
      }

      setStatusMsg(`✅ 已从知识库移除 "${article.title}"`);
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(`移除知识库失败: ${e.message}`);
    }
  }, [currentArticle]);

  // 从知识库面板上传的文档同步到本地状态
  const handleKBUploadComplete = useCallback(async (file: File) => {
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
      else fileType = 'txt';

      const article: Article = {
        id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2),
        url: `local://${timestamp}/${file.name}`,
        title: title,
        content: text,
        fetchedAt: timestamp,
        fileType,
        fileData: file,
        isSavedToKB: true  // 直接标记为入库
      };

      await dbSaveArticle(article);
      setSavedArticles((prev) => [article, ...prev]);
    } catch (err) {
      console.error('KB UI Sync error:', err);
    }
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
        id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2),
        url: `local://${timestamp}/${file.name}`, // 伪协议 URL
        title: title,
        content: text,
        fetchedAt: timestamp,
        fileType,
        fileData: file, // 存储原始 Blob
      };

      setCurrentArticle(article);

      // 持久化到 IndexedDB
      // 注意：IndexedDB 可能限制 Blob 大小，若过大可能需要单独处理
      await dbSaveArticle(article);

      setSavedArticles((prev) => [article, ...prev]);

      // 异步后台 AI 打标
      fetchArticleTags(article);

      // 初始化 AI 对话上下文
      const systemMsg: ChatMessage = {
        id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2),
        role: 'system',
        content: `你是一个专业的学习助手。用户正在阅读本地文件 "${file.name}"，请基于文件内容回答用户的问题。回答时请使用中文。\n\n---\n${article.content}\n---`,
        timestamp: Date.now(),
      };

      setMessages([systemMsg]);
      messagesRef.current = [systemMsg];
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

  // 计算当前在知识库中的文章
  const kbArticles = savedArticles.filter(a => a.isSavedToKB);

  return (
    <>
      <TopBar
        onFetchUrl={handleFetchUrl}
        onFileUpload={handleFileUpload}
        isFetching={isFetching}
        theme={theme}
        onToggleTheme={toggleTheme}
        onToggleHistory={() => setIsHistoryOpen(!isHistoryOpen)}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        kbArticles={kbArticles}
        onRemoveFromKB={handleRemoveFromKB}
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

      {activeTab === 'reader' ? (
        <main className="flex-1 flex overflow-hidden p-3 pt-0 sm:px-4 sm:pb-4">
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
                currentArticle={currentArticle}
                onUpdateArticle={handleUpdateArticle}
                isStreaming={isStreaming}
                chatMode={chatMode}
                onChatModeChange={setChatMode}
              />
            }
          />
        </main>
      ) : (
        <div className="flex-1 overflow-hidden bg-[var(--color-bg-primary)]">
          <KnowledgeBase onUploadComplete={handleKBUploadComplete} />
        </div>
      )}

      <HistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        articles={savedArticles}
        onLoadArticle={handleLoadArticle}
        onDeleteArticle={handleDeleteArticle}
        onAddToKB={handleAddToKB}
      />
    </>
  );
}
