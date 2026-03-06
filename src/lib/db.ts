import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Article, ChatMessage } from '../types';

// ============================================================
// StudyFlow IndexedDB 持久化层
// DB: studyflow-db (v2)
// Stores: articles, chatSessions
// ============================================================

interface StudyFlowDB extends DBSchema {
    articles: {
        key: string;           // Article.id
        value: Article;
        indexes: {
            'by-url': string;
            'by-date': number;
        };
    };
    chatSessions: {
        key: string;           // articleId
        value: {
            articleId: string;
            messages: ChatMessage[];
            updatedAt: number;
        };
    };
}

const DB_NAME = 'studyflow-db';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<StudyFlowDB>> | null = null;

function getDB(): Promise<IDBPDatabase<StudyFlowDB>> {
    if (!dbPromise) {
        dbPromise = openDB<StudyFlowDB>(DB_NAME, DB_VERSION, {
            upgrade(db, oldVersion, _newVersion, transaction) {
                // v0 → v1: 创建 stores
                if (oldVersion < 1) {
                    const articleStore = db.createObjectStore('articles', { keyPath: 'id' });
                    articleStore.createIndex('by-url', 'url', { unique: true });
                    articleStore.createIndex('by-date', 'fetchedAt', { unique: false });
                    db.createObjectStore('chatSessions', { keyPath: 'articleId' });
                }

                // v1 → v2: 为现有文章补充空 tags
                if (oldVersion < 2) {
                    const store = transaction.objectStore('articles');
                    store.openCursor().then(function iterate(cursor): Promise<void> | undefined {
                        if (!cursor) return;
                        const article = cursor.value;
                        if (!article.tags) {
                            article.tags = [];
                            cursor.update(article);
                        }
                        return cursor.continue().then(iterate);
                    });
                }
            },
        });
    }
    return dbPromise;
}

// ============ Articles ============

/** 保存/更新文章（同 URL 自动覆盖旧记录） */
export async function saveArticle(article: Article): Promise<void> {
    const db = await getDB();
    // 检查是否已有同 URL 的旧文章 → 先删除（避免 unique index 冲突）
    const existing = await db.getFromIndex('articles', 'by-url', article.url);
    if (existing && existing.id !== article.id) {
        const tx = db.transaction(['articles', 'chatSessions'], 'readwrite');
        await Promise.all([
            tx.objectStore('articles').delete(existing.id),
            tx.objectStore('chatSessions').delete(existing.id),
            tx.done,
        ]);
    }
    await db.put('articles', article);
}

/** 更新文章 (saveArticle 的别名，用于语义化) */
export const updateArticle = saveArticle;

/** 获取全部文章（按抓取时间降序） */
export async function getAllArticles(): Promise<Article[]> {
    const db = await getDB();
    const all = await db.getAllFromIndex('articles', 'by-date');
    return all.reverse(); // by-date 升序 → reverse 为降序
}

/** 删除文章 + 关联聊天 */
export async function deleteArticle(id: string): Promise<void> {
    const db = await getDB();
    const tx = db.transaction(['articles', 'chatSessions'], 'readwrite');
    await Promise.all([
        tx.objectStore('articles').delete(id),
        tx.objectStore('chatSessions').delete(id),
        tx.done,
    ]);
}

/** 更新文章标签 */
export async function updateArticleTags(id: string, tags: string[]): Promise<void> {
    const db = await getDB();
    const article = await db.get('articles', id);
    if (article) {
        article.tags = tags;
        await db.put('articles', article);
    }
}

// ============ Chat Sessions ============

/** 保存聊天记录（整体覆盖） */
export async function saveChatSession(articleId: string, messages: ChatMessage[]): Promise<void> {
    const db = await getDB();
    await db.put('chatSessions', {
        articleId,
        messages,
        updatedAt: Date.now(),
    });
}

/** 读取聊天记录 */
export async function getChatSession(articleId: string): Promise<ChatMessage[] | null> {
    const db = await getDB();
    const session = await db.get('chatSessions', articleId);
    return session?.messages ?? null;
}
