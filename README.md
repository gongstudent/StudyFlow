# StudyFlow

<div align="center">
  🌐 <a href="#english">English</a> | 🇨🇳 <a href="#简体中文">简体中文</a>
</div>

---

<h2 id="english">🇬🇧 English</h2>

StudyFlow is an AI-powered study assistant application built with React, Vite, TypeScript, Tailwind CSS, and Electron. It features local AI integration using [Ollama](https://ollama.com/), providing an intelligent environment for reading, summarizing, translating, and chatting with documents and web articles.

### 🌟 Online Demo

You can try the UI of the application online: **[Live Demo](https://gongstudent.github.io/StudyFlow/)**

> **Note**: The online demo is a static frontend. Features requiring local AI (Ollama) or the local scraping proxy (like Chat, Translate, and URL Fetching) will not function. To experience the full capabilities, please run the application locally!

### 🚀 Features
- **Document Parsing & Web Scraping**: Read local files (`.md`, `.txt`, `.pdf`, `.docx`) or fetch contents directly from URLs.
- **Local AI Integration**: Fully autonomous and private local AI using Ollama (default: `qwen2.5:7b`).
- **AI Chat**: Have deep, contextual conversations with the content you are reading.
- **In-place Translation**: Seamless translation of long articles into Chinese, retaining markdown formatting.
- **AI Tagging**: Automatic extraction of core technical tags for better library categorization.
- **Draft Generator**: Quickly generate summaries or blog post drafts from selected text.
- **Cross-Platform**: Packaged with Electron to run seamlessly on your desktop.

### 🛠️ Tech Stack
- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS v4, Lucide React
- **Backend / Intercept**: Native Express Server (`scraper.mjs`)
- **AI Engine**: Local Ollama Server
- **Desktop Packaging**: Electron & Electron Builder

### ⚙️ Prerequisites
1. **Node.js**: Ensure you have Node.js installed (v18+ recommended).
2. **Ollama**: You must have [Ollama](https://ollama.com/) installed and running locally.
3. Download the default model:
   ```bash
   ollama run qwen2.5:7b
   ```

### 📦 Getting Started
1. **Install Dependencies**
   ```bash
   npm install
   ```
2. **Start the Application in Development Mode**
   ```bash
   npm run electron:dev
   ```

### 🏗️ Build for Production
To package the application for your operating system:
```bash
npm run electron:build
```
The compiled binaries will be available in the `release/` directory.

---

<h2 id="简体中文">🇨🇳 简体中文</h2>

StudyFlow 是一款基于 React、Vite、TypeScript、Tailwind CSS 和 Electron 构建的 AI 驱动学习助手应用。它利用 [Ollama](https://ollama.com/) 实现了本地 AI 集成，为您在阅读、总结、翻译和向文档或网页内容提问时，提供智能化的环境。

### 🌟 在线体验

您可以访问我们的静态在线 Demo 来体验用户界面：**[在线演示](https://gongstudent.github.io/StudyFlow/)**

> **注意**：在线 Demo 仅展示纯前端界面。所有依赖本地 AI（Ollama）或本地抓取代理的功能（例如 AI 对话、全文翻译、输入 URL 抓取等）在此模式下将无法工作。为了获得最完整的体验，请在本地运行此项目！

### 🚀 核心特性
- **文档解析与网页抓取**：支持读取本地文件（`.md`、`.txt`、`.pdf`、`.docx`）或直接抓取网页链接的内容。
- **本地 AI 赋能**：使用 Ollama（默认模型：`qwen2.5:7b`）提供完全自主且保护隐私的本地 AI 服务。
- **AI 对话交互**：针对您正在阅读的内容，进行深度的上下文对话。
- **长文原页翻译**：支持将外文长篇文章无缝翻译为中文，并保留原始的 Markdown 格式排版。
- **AI 智能标签**：自动提取核心技术标签，方便文章归档与管理。
- **自动草稿生成**：根据选中的文本，快速生成总结笔记或技术博客草稿。
- **跨平台支持**：使用 Electron 打包，可作为桌面应用流畅运行。

### 🛠️ 技术栈
- **前端**：React 19, Vite, TypeScript, Tailwind CSS v4, Lucide React
- **后端 / 代理**：原生 Express Server (`scraper.mjs`)
- **AI 引擎**：本地 Ollama 服务
- **桌面打包**：Electron & Electron Builder

### ⚙️ 环境要求
1. **Node.js**：请确保已安装 Node.js（推荐 v18+）。
2. **Ollama**：必须在本地安装并启动 [Ollama](https://ollama.com/)。
3. 下载默认使用的 AI 模型：
   ```bash
   ollama run qwen2.5:7b
   ```

### 📦 快速开始
1. **安装依赖**
   ```bash
   npm install
   ```
2. **在开发模式下启动应用**
   ```bash
   npm run electron:dev
   ```

### 🏗️ 生产环境打包
要针对您的操作系统打包应用程序：
```bash
npm run electron:build
```
编译好的可执行文件将会输出在 `release/` 目录中。
