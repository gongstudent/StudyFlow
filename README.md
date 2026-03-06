# StudyFlow

StudyFlow is an AI-powered study assistant application built with React, Vite, TypeScript, Tailwind CSS, and Electron. It features local AI integration using [Ollama](https://ollama.com/), providing an intelligent environment for reading, summarizing, translating, and chatting with documents and web articles.

## 🚀 Features

- **Document Parsing & Web Scraping**: Read local files (`.md`, `.txt`, `.pdf`, `.docx`) or fetch contents directly from URLs.
- **Local AI Integration**: Fully autonomous and private local AI using Ollama (default: `qwen2.5:7b`).
- **AI Chat**: Have deep, contextual conversations with the content you are reading.
- **In-place Translation**: Seamless translation of long articles into Chinese, retaining markdown formatting.
- **AI Tagging**: Automatic extraction of core technical tags for better library categorization.
- **Draft Generator**: Quickly generate summaries or blog post drafts from selected text.
- **Cross-Platform**: Packaged with Electron to run seamlessly on your desktop.

## 🛠️ Tech Stack

- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS v4, Lucide React
- **Backend / Intercept**: Native Express Server (`scraper.mjs`) communicating with Electron.
- **AI Engine**: Local Ollama Server
- **Desktop Packaging**: Electron & Electron Builder

## ⚙️ Prerequisites

1. **Node.js**: Ensure you have Node.js installed (v18+ recommended).
2. **Ollama**: You must have [Ollama](https://ollama.com/) installed and running locally.
3. Download the default model used in the project by running:
   ```bash
   ollama run qwen2.5:7b
   ```

## 📦 Getting Started

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start the Application in Development Mode**
   ```bash
   npm run electron:dev
   ```
   *This starts the local express proxy, the Vite dev server, and the Electron wrapper simultaneously.*

## 🏗️ Build for Production

To package the application for your operating system (e.g., as an executable setup or portable app):

```bash
npm run electron:build
```

The compiled binaries will be available in the `release/` directory.

## 📂 Project Structure

- `/src`: Frontend React application (Components, Hooks, Lib functions)
- `/electron`: Electron main process scripts
- `scraper.mjs`: Node.js Express server to handle proxy requests, LLM API communication, and draft generation.
- `/release`: Auto-generated output directory for the compiled Electron app (Ignored in Git, generated upon build).
- `vite.config.ts`: Vite configuration, excluding API middlewares.

## 📜 License
This project is for personal study and assistant purposes. Do not use local fetching proxies to spam remote servers.
