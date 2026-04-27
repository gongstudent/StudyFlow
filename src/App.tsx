import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import TopBar from './components/TopBar';
import SplitPane from './components/SplitPane';
import ReaderPane from './components/ReaderPane';
import AISidebar from './components/AISidebar';
import HistoryDrawer from './components/HistoryDrawer';
import KnowledgeBase from './components/KnowledgeBase';
import { fetchWebContent } from './lib/scraper';
import { streamChat, streamKnowledgeBaseChat } from './lib/chat';
import {
  saveArticle as dbSaveArticle,
  getAllArticles as dbGetAllArticles,
  deleteArticle as dbDeleteArticle,
  saveChatSession,
  getChatSession,
  updateArticleTags,
} from './lib/db';
import { getLLMSettings, loadLLMSettingsFromServer } from './lib/llm';
import { apiUrl, ensureApiAvailable } from './lib/config';
import { useTheme } from './hooks/useTheme';
import type { Article, ChatMessage, KbSourceItem } from './types';

const KB_CHAT_SESSION_ID = '__studyflow_kb_global_chat__';

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [currentArticle, setCurrentArticle] = useState<Article | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [savedArticles, setSavedArticles] = useState<Article[]>([]);
  const [kbSources, setKbSources] = useState<KbSourceItem[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'reader' | 'knowledge'>('reader');
  const [chatMode, setChatMode] = useState<'article' | 'knowledge'>('article');
  const [kbChatEnabled, setKbChatEnabled] = useState(false);
  const [kbChatUnavailableReason, setKbChatUnavailableReason] = useState('');

  const messagesRef = useRef<ChatMessage[]>([]);
  const streamAbortControllerRef = useRef<AbortController | null>(null);
  messagesRef.current = messages;

  const setActiveMessages = useCallback((nextMessages: ChatMessage[]) => {
    setMessages(nextMessages);
    messagesRef.current = nextMessages;
  }, []);

  const resolveChatSessionId = useCallback(
    (mode: 'article' | 'knowledge', article: Article | null): string | undefined => {
      if (mode === 'knowledge') return KB_CHAT_SESSION_ID;
      return article?.id;
    },
    []
  );

  const normalizeKbSourceFromArticle = useCallback((article: Article): string => {
    if (article.kbSource?.trim()) return article.kbSource.trim();
    const safeTitle = article.title.replace(/[\\/:*?"<>|]/g, '_') || 'article';
    return `${safeTitle}.txt`;
  }, []);

  const refreshKBSources = useCallback(async () => {
    try {
      ensureApiAvailable('Knowledge Base');
      const res = await fetch(apiUrl('/api/kb/sources'));
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      const list = Array.isArray(data?.sources) ? data.sources : [];
      const normalized: KbSourceItem[] = list
        .map((item: any) => ({
          source: String(item?.source || ''),
          sourceKey: String(item?.sourceKey || item?.source || ''),
          chunkCount: Number(item?.chunkCount || 0),
          lastIngestedAt: item?.lastIngestedAt ? Number(item.lastIngestedAt) : null,
        }))
        .filter((item: KbSourceItem) => !!item.sourceKey);
      setKbSources(normalized);
    } catch {
      // Keep UI usable even if source sync fails
    }
  }, []);

  const refreshKbChatAvailability = useCallback(async (): Promise<{ ok: boolean; reason: string }> => {
    const llm = getLLMSettings();
    if (!llm.embeddingBaseUrl.trim() || !llm.embeddingModelName.trim()) {
      const reason = '请先在设置中配置向量模型（Embedding）的 Base URL 和模型名称。';
      setKbChatEnabled(false);
      setKbChatUnavailableReason(reason);
      return { ok: false, reason };
    }

    try {
      ensureApiAvailable('Knowledge Base');
      const res = await fetch(apiUrl('/api/kb/health'));
      if (!res.ok) {
        const data = await res.json().catch(() => ({} as any));
        const reason = String(
          data?.error || '向量库当前不可用，请先启动 Qdrant（默认 http://localhost:6333）。'
        );
        setKbChatEnabled(false);
        setKbChatUnavailableReason(reason);
        return { ok: false, reason };
      }

      setKbChatEnabled(true);
      setKbChatUnavailableReason('');
      return { ok: true, reason: '' };
    } catch (err: any) {
      const reason = String(err?.message || '无法连接知识库服务，请先启动 `npm run server`。');
      setKbChatEnabled(false);
      setKbChatUnavailableReason(reason);
      return { ok: false, reason };
    }
  }, []);

  useEffect(() => {
    loadLLMSettingsFromServer()
      .catch(() => {
        // Keep local fallback if backend settings are unavailable
      })
      .finally(() => {
        refreshKbChatAvailability().catch(() => {});
      });
    dbGetAllArticles()
      .then((articles) => {
        if (articles.length > 0) setSavedArticles(articles);
      })
      .catch(console.error);
    refreshKBSources();
  }, [refreshKBSources, refreshKbChatAvailability]);

  useEffect(() => {
    if (chatMode !== 'knowledge') return;
    const timer = setInterval(() => {
      refreshKbChatAvailability().catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, [chatMode, refreshKbChatAvailability]);

  useEffect(() => {
    return () => {
      streamAbortControllerRef.current?.abort();
      streamAbortControllerRef.current = null;
    };
  }, []);

  const buildSystemMessage = useCallback((content: string): ChatMessage => {
    return {
      id: crypto?.randomUUID?.() || Math.random().toString(36).substring(2),
      role: 'system',
      content,
      timestamp: Date.now(),
    };
  }, []);

  const buildArticleConversation = useCallback(
    (article: Article, sourceName?: string): ChatMessage[] => {
      const sourceLabel = sourceName || article.title;
      const systemMsg = buildSystemMessage(
        `你是一个专业的学习助手。用户正在阅读以下资料（${sourceLabel}），请基于内容回答问题。` +
          '请使用中文回答，如涉及代码请使用 Markdown 代码块。\n\n' +
          `---\n${article.content}\n---`
      );
      return [systemMsg];
    },
    [buildSystemMessage]
  );

  const persistChatSession = useCallback((articleId: string | undefined, nextMessages: ChatMessage[]) => {
    if (!articleId) return;
    saveChatSession(articleId, nextMessages).catch(console.error);
  }, []);

  const loadChatMessagesForMode = useCallback(
    async (mode: 'article' | 'knowledge', article: Article | null): Promise<ChatMessage[]> => {
      if (mode === 'knowledge') {
        const saved = await getChatSession(KB_CHAT_SESSION_ID).catch(() => null);
        return saved && saved.length > 0 ? saved : [];
      }

      if (!article) return [];
      const saved = await getChatSession(article.id).catch(() => null);
      if (saved && saved.length > 0) return saved;
      return buildArticleConversation(article);
    },
    [buildArticleConversation]
  );

  const fetchArticleTags = useCallback(async (article: Article) => {
    try {
      const reqMessages = [
        { role: 'system', content: 'You are a helpful assistant that extracts exactly 3-5 core technical tags from the given text.' },
        {
          role: 'user',
          content:
            `Extract tags for this article. Title: ${article.title}\n` +
            `Content: ${article.content.substring(0, 3000)}\n` +
            'Return ONLY a JSON array of strings like ["tag1", "tag2"]. No markdown formatting.',
        },
      ];

      const { fetchLLMResponse } = await import('./lib/llm');
      const responseText = await fetchLLMResponse(reqMessages);

      let tags: string[] = [];
      try {
        const cleaned = responseText.replace(/```json\n?/, '').replace(/```\n?/, '');
        tags = JSON.parse(cleaned);
      } catch {
        return;
      }

      if (!tags?.length) return;
      const finalTags = tags.slice(0, 5);
      await updateArticleTags(article.id, finalTags);
      setSavedArticles((prev) => prev.map((a) => (a.id === article.id ? { ...a, tags: finalTags } : a)));
    } catch {
      // Tagging failure should not block the main flow
    }
  }, []);

  const handleFetchUrl = useCallback(
    async (url: string) => {
      setIsFetching(true);
      setErrorMsg(null);
      try {
        const article = await fetchWebContent(url);
        setCurrentArticle(article);

        await dbSaveArticle(article);
        setSavedArticles((prev) => {
          const exists = prev.find((a) => a.url === article.url);
          if (exists) return prev;
          return [article, ...prev];
        });

        fetchArticleTags(article);
        const articleMessages = buildArticleConversation(article);
        persistChatSession(article.id, articleMessages);
        if (chatMode === 'article') {
          setActiveMessages(articleMessages);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : '抓取失败，请检查 URL 是否正确';
        setErrorMsg(message);
        setTimeout(() => setErrorMsg(null), 5000);
      } finally {
        setIsFetching(false);
      }
    },
    [buildArticleConversation, chatMode, fetchArticleTags, persistChatSession, setActiveMessages]
  );

  const handleStopStreaming = useCallback(() => {
    if (!isStreaming) return;
    streamAbortControllerRef.current?.abort();
    streamAbortControllerRef.current = null;
  }, [isStreaming]);

  const handleSendMessage = useCallback(
    async (content: string) => {
      if (isStreaming) return;
      if (chatMode === 'knowledge') {
        const availability = await refreshKbChatAvailability();
        if (!availability.ok) {
          setErrorMsg(availability.reason);
          return;
        }
      }
      const activeSessionId = resolveChatSessionId(chatMode, currentArticle);

      const userMsg: ChatMessage = {
        id: crypto?.randomUUID?.() || Math.random().toString(36).substring(2),
        role: 'user',
        content,
        timestamp: Date.now(),
      };
      const aiMsg: ChatMessage = {
        id: crypto?.randomUUID?.() || Math.random().toString(36).substring(2),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      };

      const newMessages = [...messagesRef.current, userMsg];
      const pendingMessages = [...newMessages, aiMsg];
      setMessages(pendingMessages);
      messagesRef.current = pendingMessages;
      persistChatSession(activeSessionId, pendingMessages);
      setIsStreaming(true);
      const abortController = new AbortController();
      streamAbortControllerRef.current = abortController;

      const streamFunction = chatMode === 'knowledge' ? streamKnowledgeBaseChat : streamChat;

      await streamFunction(
        newMessages,
        (text: string) => {
          aiMsg.content += text;
          setMessages((prev) => prev.map((m) => (m.id === aiMsg.id ? { ...m, content: aiMsg.content } : m)));
        },
        () => {
          streamAbortControllerRef.current = null;
          setIsStreaming(false);
          const finalMessages = [...newMessages, { ...aiMsg }];
          messagesRef.current = finalMessages;
          persistChatSession(activeSessionId, finalMessages);
        },
        (error: string) => {
          aiMsg.content += `\n\n⚠️ 错误: ${error}`;
          setMessages((prev) => prev.map((m) => (m.id === aiMsg.id ? { ...m, content: aiMsg.content } : m)));
          const failedMessages = [...newMessages, { ...aiMsg }];
          messagesRef.current = failedMessages;
          streamAbortControllerRef.current = null;
          setIsStreaming(false);
          persistChatSession(activeSessionId, failedMessages);
        },
        {
          signal: abortController.signal,
          onAbort: () => {
            if (!aiMsg.content.trim()) {
              aiMsg.content = '[Stopped by user]';
            }
            setMessages((prev) => prev.map((m) => (m.id === aiMsg.id ? { ...m, content: aiMsg.content } : m)));
            const stoppedMessages = [...newMessages, { ...aiMsg }];
            messagesRef.current = stoppedMessages;
            streamAbortControllerRef.current = null;
            setIsStreaming(false);
            persistChatSession(activeSessionId, stoppedMessages);
          },
        }
      );
    },
    [
      chatMode,
      currentArticle,
      isStreaming,
      persistChatSession,
      refreshKbChatAvailability,
      resolveChatSessionId,
    ]
  );

  const handleSelectTextWithContext = useCallback(
    (rawText: string) => {
      const match = rawText.match(/^\[([^\]]+)\]\s*/);
      const action = match?.[1] || 'ask';
      const selectedText = (match ? rawText.slice(match[0].length) : rawText).trim();
      const articleMeta = currentArticle
        ? `Title: ${currentArticle.title}\nSource: ${currentArticle.url}`
        : 'Title: unknown\nSource: unknown';

      const enrichedPrompt =
        `[Action] ${action}\n` +
        `[Mode] ${chatMode === 'article' ? 'current-article' : 'global-knowledge'}\n\n` +
        `[Selected Text]\n${selectedText}\n\n` +
        `[Source Context]\n${articleMeta}\n\n` +
        (chatMode === 'article'
          ? '请优先基于当前文章内容回答。'
          : '请结合知识库检索结果回答，并说明与选中文本的关联。');

      handleSendMessage(enrichedPrompt);
      setIsHistoryOpen(false);
    },
    [chatMode, currentArticle, handleSendMessage]
  );

  const handleLoadArticle = useCallback(
    async (article: Article) => {
      const currentSessionId = resolveChatSessionId(chatMode, currentArticle);
      if (currentSessionId && messagesRef.current.length > 0) {
        persistChatSession(currentSessionId, messagesRef.current);
      }

      setCurrentArticle(article);
      if (chatMode !== 'article') {
        return;
      }

      const articleMessages = await loadChatMessagesForMode('article', article);
      setActiveMessages(articleMessages);
      if (articleMessages.length > 0) {
        persistChatSession(article.id, articleMessages);
      }
    },
    [
      chatMode,
      currentArticle,
      loadChatMessagesForMode,
      persistChatSession,
      resolveChatSessionId,
      setActiveMessages,
    ]
  );

  const handleChatModeChange = useCallback(
    async (nextMode: 'article' | 'knowledge') => {
      if (isStreaming) return;
      if (nextMode === chatMode) return;
      if (nextMode === 'knowledge') {
        const availability = await refreshKbChatAvailability();
        if (!availability.ok) {
          setErrorMsg(availability.reason);
          return;
        }
      }

      const currentSessionId = resolveChatSessionId(chatMode, currentArticle);
      if (currentSessionId && messagesRef.current.length > 0) {
        persistChatSession(currentSessionId, messagesRef.current);
      }

      setChatMode(nextMode);
      const nextMessages = await loadChatMessagesForMode(nextMode, currentArticle);
      setActiveMessages(nextMessages);

      const nextSessionId = resolveChatSessionId(nextMode, currentArticle);
      if (nextSessionId && nextMessages.length > 0) {
        persistChatSession(nextSessionId, nextMessages);
      }
    },
    [
      chatMode,
      currentArticle,
      isStreaming,
      loadChatMessagesForMode,
      persistChatSession,
      refreshKbChatAvailability,
      resolveChatSessionId,
      setActiveMessages,
    ]
  );

  const handleDeleteArticle = useCallback((id: string) => {
    dbDeleteArticle(id).catch(console.error);
    setSavedArticles((prev) => prev.filter((a) => a.id !== id));
    setCurrentArticle((curr) => (curr?.id === id ? null : curr));
  }, []);

  const handleAddToKB = useCallback(
    async (article: Article) => {
      try {
        ensureApiAvailable('Knowledge Base');
        setStatusMsg(`正在将 "${article.title}" 录入知识库...`);

        const llmConf = getLLMSettings();
        const blob = new Blob([article.content], { type: 'text/plain' });
        const safeTitle = article.title.replace(/[\\/:*?"<>|]/g, '_') || 'article';
        const sourceName = `${safeTitle}.txt`;
        const file = new File([blob], sourceName, { type: 'text/plain' });

        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch(apiUrl('/api/kb/upload'), {
          method: 'POST',
          headers: {
            'x-embedding-url': llmConf.embeddingBaseUrl,
            'x-embedding-key': llmConf.embeddingApiKey,
            'x-embedding-model': llmConf.embeddingModelName,
          },
          body: formData,
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || '上传失败');

        const updatedArticle: Article = { ...article, isSavedToKB: true, kbSource: sourceName };
        await dbSaveArticle(updatedArticle);
        setSavedArticles((prev) => prev.map((a) => (a.id === article.id ? updatedArticle : a)));
        setCurrentArticle((curr) => (curr?.id === article.id ? updatedArticle : curr));

        await refreshKBSources();
        setStatusMsg(`✅ 成功录入 "${article.title}" 到知识库`);
        setTimeout(() => setStatusMsg(null), 3000);
      } catch (e: any) {
        setErrorMsg(`录入知识库失败: ${e.message}`);
      } finally {
        setIsHistoryOpen(false);
      }
    },
    [refreshKBSources]
  );

  const clearLocalKBFlagBySource = useCallback(
    async (source: string) => {
      const matched = savedArticles.filter(
        (article) => article.isSavedToKB && normalizeKbSourceFromArticle(article) === source
      );
      if (matched.length === 0) return;

      const updated = matched.map((article) => ({ ...article, isSavedToKB: false }));
      await Promise.all(updated.map((article) => dbSaveArticle(article)));
      const updatedById = new Map(updated.map((article) => [article.id, article]));

      setSavedArticles((prev) => prev.map((article) => updatedById.get(article.id) ?? article));
      setCurrentArticle((curr) => (curr ? (updatedById.get(curr.id) ?? curr) : curr));
    },
    [normalizeKbSourceFromArticle, savedArticles]
  );

  const removeFromKBBySource = useCallback(
    async (source: string, label?: string) => {
      try {
        ensureApiAvailable('Knowledge Base');
        if (!source) throw new Error('Invalid KB source');
        const targetLabel = label || source;
        setStatusMsg(`正在从知识库移除 "${targetLabel}"...`);

        const res = await fetch(apiUrl('/api/kb/delete'), {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || '移除失败');
        }

        await clearLocalKBFlagBySource(source);
        await refreshKBSources();
        setStatusMsg(`✅ 已从知识库移除 "${targetLabel}"`);
        setTimeout(() => setStatusMsg(null), 3000);
      } catch (e: any) {
        setErrorMsg(`移除知识库失败: ${e.message}`);
      }
    },
    [clearLocalKBFlagBySource, refreshKBSources]
  );

  const handleRemoveFromKBSource = useCallback(
    async (source: string, label?: string) => {
      await removeFromKBBySource(source, label || source);
    },
    [removeFromKBBySource]
  );

  const handleKBUploadComplete = useCallback(
    async (file: File) => {
      try {
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
          id: crypto?.randomUUID?.() || Math.random().toString(36).substring(2),
          url: `local://${timestamp}/${file.name}`,
          title,
          content: text,
          fetchedAt: timestamp,
          fileType,
          fileData: file,
          isSavedToKB: true,
          kbSource: file.name,
        };

        await dbSaveArticle(article);
        setSavedArticles((prev) => {
          const withoutDuplicate = prev.filter((item) => item.url !== article.url);
          return [article, ...withoutDuplicate];
        });
        await refreshKBSources();
      } catch (err) {
        console.error('KB UI Sync error:', err);
      }
    },
    [refreshKBSources]
  );

  const handleFileUpload = useCallback(
    async (file: File) => {
      if (!file) return;
      setIsFetching(true);
      setErrorMsg(null);

      try {
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
          id: crypto?.randomUUID?.() || Math.random().toString(36).substring(2),
          url: `local://${timestamp}/${file.name}`,
          title,
          content: text,
          fetchedAt: timestamp,
          fileType,
          fileData: file,
        };

        setCurrentArticle(article);
        await dbSaveArticle(article);
        setSavedArticles((prev) => [article, ...prev]);
        fetchArticleTags(article);
        const articleMessages = buildArticleConversation(article, file.name);
        persistChatSession(article.id, articleMessages);
        if (chatMode === 'article') {
          setActiveMessages(articleMessages);
        }
      } catch (err) {
        setErrorMsg(`解析失败: ${err instanceof Error ? err.message : '未知错误'}`);
      } finally {
        setIsFetching(false);
      }
    },
    [buildArticleConversation, chatMode, fetchArticleTags, persistChatSession, setActiveMessages]
  );

  const handleUpdateArticle = useCallback(async (updatedArticle: Article) => {
    setCurrentArticle(updatedArticle);
    setSavedArticles((prev) => prev.map((a) => (a.id === updatedArticle.id ? updatedArticle : a)));
    await dbSaveArticle(updatedArticle);
  }, []);

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
        kbSources={kbSources}
        onRemoveFromKBSource={handleRemoveFromKBSource}
      />

      {statusMsg && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 border-b border-blue-200 text-[13px] text-blue-700 animate-in slide-in-from-top-2">
          <Loader2 size={14} className="animate-spin" />
          <span className="font-medium">{statusMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 border-b border-red-200 text-[13px] text-red-700 animate-in slide-in-from-top-2">
          <span className="font-medium">⚠️</span>
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
                onSelectText={handleSelectTextWithContext}
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
                onStopStreaming={handleStopStreaming}
                chatMode={chatMode}
                onChatModeChange={handleChatModeChange}
                knowledgeChatEnabled={kbChatEnabled}
                knowledgeChatUnavailableReason={kbChatUnavailableReason}
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
