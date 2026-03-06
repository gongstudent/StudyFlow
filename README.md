# 📚 StudyFlow: Your Ultimate AI-Powered Study Assistant

<div align="center">

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-191970?style=for-the-badge&logo=Electron&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
<br>
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](http://makeapullrequest.com)

<br>
  🌐 <a href="#english">English</a> | 🇨🇳 <a href="#简体中文">简体中文</a>
</div>

<div align="center">
  <br />
  <!-- UI Placeholder -->
  <img src="./public/screenshot.png" alt="StudyFlow Main Interface" width="800" />
</div>

---

<h2 id="english">🇬🇧 English</h2>

**StudyFlow** is a modern, beautifully crafted application designed to supercharge your learning and reading workflow. Built with React, TypeScript, and Electron, it brings the power of AI directly to your documents and web pages. 

Whether you want absolute privacy with **Local AI (Ollama)** or cloud-powered convenience via **GitHub Models API**, StudyFlow adapts to your needs.

### ✨ Experience It Now

Try StudyFlow directly in your browser! Zero installation required.

👉 **[Launch Online Demo](https://gongstudent.github.io/StudyFlow/)**

> 💡 **Tip for the Online Demo**: The web version now supports **GitHub Models API**! Just click the **Settings (⚙️)** icon in the top right, enter your free [GitHub Personal Access Token](https://github.com/settings/tokens/new), and instantly unlock features like AI Chat, Full-Page Translation, and the AI Writing Assistant—all running completely in your browser! *(Note: URL scraping is limited in the web demo due to CORS limitations, please use local file uploads instead).*

---

### 🚀 Core Features

- 📑 **Universal Reading**: Seamlessly parse local files (`.md`, `.txt`, `.pdf`, `.docx`) or paste any web URL to extract its content.
- 🧠 **Dual AI Engine Support**: 
  - **Local First**: Run completely offline and private using [Ollama](https://ollama.com/) (defaults to `qwen2.5:7b`).
  - **Cloud Power**: Switch to **GitHub Models** (`gpt-4o-mini`) simply by providing a free GitHub token.
  
- 💬 **Contextual Chat**: Ask questions and chat deeply with the specific article or document you are reading.
  <br/>
  <!-- AI Chat GIF Placeholder -->
  *![AI Chat Demo](./public/chat-demo.gif)*

- 🌍 **Immersive Translation**: Translate massive articles into highly readable Chinese with one click, while perfectly preserving Markdown formatting and code blocks.
  <br/>
  <!-- Translation GIF Placeholder -->
  *![Translation Demo](./public/translation-demo.gif)*

- 🏷️ **Smart Tagging**: Automatically extract the top technical tags from your reading materials to keep your library organized.
- ✍️ **AI Writing Assistant**: Highlight any text to instantly generate concise summaries, study notes, or comprehensive tech blog drafts.
- 💻 **Native Desktop App**: Packaged with Electron for a buttery-smooth desktop experience.

### 🛠️ Tech Stack

- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS v4, Lucide Icons
- **Backend (Desktop)**: Native Express Server (`scraper.mjs`) for proxying and parsing
- **AI Integration**: Ollama REST API & GitHub Models Server-Sent Events (SSE)
- **Desktop**: Electron & Electron Builder

### ⚙️ Local Desktop Setup (Recommended)

To enjoy the full power of StudyFlow (including local AI and unrestricted web scraping), run it locally:

1. **Install Node.js** (v18+ recommended) and the [Ollama](https://ollama.com/) desktop app.
2. **Download the local model**:
   ```bash
   ollama run qwen2.5:7b
   ```
3. **Install & Run StudyFlow**:
   ```bash
   npm install
   npm run electron:dev
   ```
4. **Build for Production**:
   ```bash
   npm run electron:build
   ```

### 🤝 Contributing

We welcome all contributions! Whether it's reporting a bug, suggesting a new feature, or submitting a Pull Request, your help is appreciated. Please read our [Contributing Guidelines](CONTRIBUTING.md) before getting started.

### 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<h2 id="简体中文">🇨🇳 简体中文</h2>

**StudyFlow** 是一款现代、精美的学习辅助应用，旨在全面提升您的阅读和学习工作流。基于 React、TypeScript 和 Electron 构建，它将强大的 AI 能力完美融入了您的文档阅读和网页浏览中。

无论您是追求极致隐私的 **本地 AI (Ollama)** 偏好者，还是希望体验云端强力模型的 **GitHub Models API** 用户，StudyFlow 都能完美适配您的需求。

### ✨ 立即在线体验

无需任何安装，直接在浏览器中感受 StudyFlow 的魅力！

👉 **[启动在线演示 (Live Demo)](https://gongstudent.github.io/StudyFlow/)**

> 💡 **在线演示端提示**：网页版现已全面接入 **GitHub Models API**！只需点击右上角的**设置 (⚙️)** 按钮，填入您免费获取的 [GitHub Token](https://github.com/settings/tokens/new)，即可瞬间解锁 AI 对话、长文沉浸式翻译、AI 辅助写作等高级功能！*(注：受浏览器跨域限制，网页版暂不支持直接抓取外部 URL，请使用本地文件导入功能代替)*。

---

### 🚀 核心亮点

- 📑 **全能阅读器**：无缝解析本地文件（`.md`、`.txt`、`.pdf`、`.docx`），或直接粘贴任意网页链接提取正文。
- 🧠 **双擎 AI 支持**：
  - **本地优先**：通过 [Ollama](https://ollama.com/) 实现完全离线、保护隐私的本地 AI 服务（默认加载 `qwen2.5:7b`）。
  - **云端接入**：配置免费的 GitHub Token 后，即可一键切换至强大的 **GitHub Models** (`gpt-4o-mini`)。

- 💬 **上下文关联对话**：针对您当前正在阅读的特定文章或文档，与 AI 展开深度讨论和问答。
  <br/>
  <!-- AI 对话 GIF 占位符 -->
  *![AI 对话演示](./public/chat-demo.gif)*

- 🌍 **长文沉浸式翻译**：一键将万字长文翻译为流畅易读的中文，且**完美保留**所有 Markdown 排版、链接和代码块。
  <br/>
  <!-- 长文翻译 GIF 占位符 -->
  *![长文翻译演示](./public/translation-demo.gif)*

- 🏷️ **智能标签分类**：自动从阅读材料中提取核心技术标签，让您的知识库井井有条。
- ✍️ **AI 写作助手**：一键为您阅读的内容生成精简总结、学习笔记，甚至是结构完整的技术博客草稿。
- 💻 **原生桌面体验**：借助 Electron 打包，为您提供丝滑的跨平台桌面客户端体验。

### 🛠️ 技术架构

- **前端界面**：React 19, Vite, TypeScript, Tailwind CSS v4, Lucide Icons
- **本地后端**：原生 Express Server (`scraper.mjs`)，负责解决跨域抓取和流式转发
- **AI 交互**：Ollama REST API 与 GitHub Models SSE 流式输出
- **桌面端应用**：基于 Electron & Electron Builder 构建

### ⚙️ 本地桌面端安装指南 (推荐)

为了获得 StudyFlow 最完整的体验（解锁全部网页精准抓取及本地离线 AI），我们强烈推荐您在本地运行：

1. **准备环境**：确保您已安装 Node.js (推荐 v18+) 以及 [Ollama](https://ollama.com/) 客户端。
2. **下载本地大模型**：
   ```bash
   ollama run qwen2.5:7b
   ```
3. **安装并启动 StudyFlow**：
   ```bash
   npm install
   npm run electron:dev
   ```
4. **打包生产环境客户端**：
   ```bash
   npm run electron:build
   ```

### 🤝 参与贡献

我们非常欢迎任何形式的贡献！无论是提交 Issue 反馈 Bug，提出新功能建议，还是提交 Pull Request 改进代码，我们都无比感激。在开始之前，请查阅我们的 [贡献指南](CONTRIBUTING.md)（待补充）。

### 📄 开源协议

本项目基于 MIT 协议开源，详情请参阅 [LICENSE](LICENSE) 文件。

---
<div align="center">
  <i>Built with ❤️ to make learning a flowing experience.</i>
</div>
