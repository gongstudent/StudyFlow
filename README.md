# StudyFlow

AI-powered reading and learning workspace with:

- URL/PDF/DOCX/TXT reading
- AI chat (current article / global knowledge base)
- Personal notes
- Qdrant-backed RAG knowledge base

---

## 中文说明（推荐先看）

### 1) 项目是什么

StudyFlow 是一个“阅读 + 问答 + 笔记 + 知识库”的一体化学习工具。

核心能力：

- 导入网页或本地文档（`pdf/docx/txt/md`）
- 对当前文章提问
- 对全局知识库提问（RAG）
- 上传文档到向量库（Qdrant）
- 流式输出，支持**手动终止**本次回答

### 2) 环境要求

- Node.js 20+
- npm
- Docker Desktop（本地开发至少需要用来启动 Qdrant）

### 3) 启动方式（两套，二选一）

不要同时混用两套方式，否则会端口冲突（`5173 / 3000 / 6333`）。

#### 方式 A：本地开发（推荐）

1. 先启动向量库（Qdrant）：

```bash
docker compose up -d qdrant
```

2. 安装依赖并启动后端：

```bash
npm install
npm run server
```

3. 新开终端启动前端：

```bash
npm run dev
```

4. 访问：

- Web: `http://localhost:5173`
- API: `http://localhost:3000`
- Qdrant: `http://localhost:6333`

#### 方式 B：全 Docker

```bash
docker compose up --build -d
```

访问：`http://localhost:5173`

---

### 4) 模型配置（必须）

在页面“模型设置”中分别配置：

- Chat LLM（对话模型）
- Embedding（向量模型）

常见本地示例（Ollama OpenAI 兼容网关）：

- Chat Base URL: `http://localhost:11434/v1`
- Embedding Base URL: `http://localhost:11434/v1`

配置会持久化到：

- `data/llm-settings.json`

---

### 5) 知识库（RAG）说明

上传文件后，后端会做：

1. 文本抽取
2. 分块（默认 `chunk=500`，`overlap=50`）
3. 生成向量
4. 写入 Qdrant

全局知识库问答时：

- 会先从向量库召回候选块
- 再做跨来源的上下文选择，减少“单文档霸榜”
- 特殊问题（如“列出知识库所有文件”）走真实索引清单，避免模型猜测

---

### 6) 你关心的交互：发送后可终止

现在聊天区支持：

- 发送后按钮会变成“停止”
- 点击后会立刻中断当前流式输出
- 不需要刷新页面

---

### 7) 常见报错排查

#### `Failed to fetch` / `ERR_CONNECTION_REFUSED`

- 检查 `npm run server` 是否在运行
- 检查前端请求的是 `http://localhost:3000`

#### `QDRANT_UNAVAILABLE` / `Qdrant is not reachable`

- 检查 Qdrant 是否启动：`docker compose ps`
- 本地开发时确认 `6333` 端口可访问

#### `/api/kb/sources` 500

- 通常是 Qdrant 未启动或连接失败
- 先看 `npm run server` 控制台日志

#### `Failed to parse JSON response from chat endpoint`

- Chat Base URL 不是 OpenAI 兼容接口（通常缺少 `/v1`）
- 或上游返回了 HTML 错误页

---

### 8) 常用命令

```bash
# 前端开发
npm run dev

# 后端 API
npm run server

# 前后端一起启动
npm run dev:all

# 类型构建
npm run build

# Electron 开发
npm run electron:dev
```

---

## English

### What it is

StudyFlow is a unified workspace for reading, AI chat, notes, and RAG knowledge-base workflows.

### Prerequisites

- Node.js 20+
- npm
- Docker Desktop (at least for Qdrant in local dev)

### Run modes (choose one)

Do not run both at the same time.

#### Mode A: Local development (recommended)

```bash
docker compose up -d qdrant
npm install
npm run server
# new terminal
npm run dev
```

Endpoints:

- Web: `http://localhost:5173`
- API: `http://localhost:3000`
- Qdrant: `http://localhost:6333`

#### Mode B: Full Docker

```bash
docker compose up --build -d
```

### Model settings

Configure both Chat and Embedding in app settings.  
Settings are persisted to `data/llm-settings.json`.

### RAG pipeline

Upload -> text extraction -> chunking -> embedding -> Qdrant indexing -> retrieval -> answer generation.

### UX behavior

During streaming output, the send button changes to a stop button so users can cancel the current response instantly.

### Scripts

```bash
npm run dev
npm run server
npm run dev:all
npm run build
npm run electron:dev
npm run electron:build
```
