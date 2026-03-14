/** 高亮/笔记对象 */
export interface Highlight {
  id: string;
  text: string;       // 选中的原文
  note?: string;      // 用户的笔记（如果是纯高亮则为空）
  color: string;      // 高亮颜色 (如 'yellow', 'green', 'blue')
  createdAt: number;
  /** PDF 页码 */
  pageNumber?: number;
}

/** 一篇已抓取的文章 */
export interface Article {
  id: string;
  url: string;
  title: string;
  /** Markdown 格式的正文 */
  content: string;
  /** 抓取时间 */
  fetchedAt: number;
  /** 站点 favicon URL */
  favicon?: string;
  /** AI 自动生成的标签 */
  tags?: string[];
  /** 是否已被存入知识库 */
  isSavedToKB?: boolean;
  /** 原文件类型 */
  fileType?: 'pdf' | 'docx' | 'md' | 'txt';
  /** 原文件数据 (用于 PDF 渲染) */
  fileData?: Blob;
  /** 用户高亮/笔记 */
  highlights?: Highlight[];
}

/** 单条聊天消息 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

/** 侧边栏模式 */
export type SidebarMode = 'chat' | 'history';

/** 全局应用状态 */
export interface AppState {
  /** 当前正在阅读的文章 */
  currentArticle: Article | null;
  /** 聊天消息列表 */
  messages: ChatMessage[];
  /** 侧边栏模式 */
  sidebarMode: SidebarMode;
  /** 是否正在抓取中 */
  isFetching: boolean;
  /** 已保存的文章列表 */
  savedArticles: Article[];
  /** 用户选中的文本 */
  selectedText: string;
}