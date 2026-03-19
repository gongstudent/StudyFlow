import express from 'express';
import crypto from 'crypto';
import cors from 'cors';
import http from 'http';
import https from 'https';
import { URL } from 'url';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import dotenv from 'dotenv';
import { QdrantClient } from '@qdrant/js-client-rest';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';

dotenv.config();

const app = express();
const PORT = 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// Log suppression in production
if (IS_PROD) {
    console.log = () => { };
    console.info = () => { };
    console.debug = () => { };
    // Keep console.error and console.warn for critical issues
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'studyflow-api' });
});

// ============================================================
// Ollama Local API Configuration
// ============================================================
let ollamaHostValue = process.env.OLLAMA_HOST || 'http://localhost:11434';
// 0.0.0.0 是服务器绑定地址，不能作为客户端连接目标，自动转为 localhost
ollamaHostValue = ollamaHostValue.replace(/0\.0\.0\.0/g, 'localhost');
if (!ollamaHostValue.startsWith('http://') && !ollamaHostValue.startsWith('https://')) {
    if (ollamaHostValue.includes(':')) {
        ollamaHostValue = `http://${ollamaHostValue}`;
    } else {
        ollamaHostValue = `http://${ollamaHostValue}:11434`;
    }
}
const OLLAMA_HOST = ollamaHostValue;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b';
const OLLAMA_CHAT_API = `${OLLAMA_HOST}/api/chat`;

console.log(`[Ollama] Using model: ${OLLAMA_MODEL} at ${OLLAMA_HOST}`);

// ============================================================
// File Upload & Vector DB (Qdrant) Configuration
// ============================================================

const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir });

// Use environment variable for Qdrant, defaulting to localhost for local testing
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
console.log(`[Qdrant] Assuming Qdrant is running at ${QDRANT_URL}`);
const qdrantClient = new QdrantClient({ url: QDRANT_URL });
const COLLECTION_NAME = process.env.QDRANT_COLLECTION || 'studyflow_kb';

// Lazy Qdrant collection initialization - called on first upload request
let qdrantReady = false;
async function ensureCollection() {
    try {
        const collections = await qdrantClient.getCollections();
        const exists = collections.collections.some(c => c.name === COLLECTION_NAME);
        if (!exists) {
            console.log(`[Qdrant] Creating collection: ${COLLECTION_NAME}`);
            // Use 768 as default but it will be updated on first upsert
            await qdrantClient.createCollection(COLLECTION_NAME, {
                vectors: { size: 768, distance: 'Cosine' }
            });
            console.log(`[Qdrant] Collection ${COLLECTION_NAME} created.`);
        } else {
            console.log(`[Qdrant] Collection ${COLLECTION_NAME} exists.`);
        }
        qdrantReady = true;
    } catch (e) {
        console.error(`[Qdrant] Not available at ${QDRANT_URL}: ${e.message}`);
        qdrantReady = false;
    }
}
// Try once at startup (non-blocking)
ensureCollection().catch(() => { });

// ============================================================
// Helper Functions (Retry Logic)
// ============================================================
const RETRY_CONFIG = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 16000,
    retryableStatusCodes: [429, 500, 502, 503, 504],
};

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getBackoffDelay(attempt) {
    const delay = Math.min(
        RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt) + Math.random() * 500,
        RETRY_CONFIG.maxDelayMs
    );
    return Math.round(delay);
}

function ollamaRequestWithRetry(
    url,
    body,
    timeoutMs = 60000
) {
    return new Promise(async (resolve, reject) => {
        let lastError = null;
        const jsonBody = JSON.stringify(body);

        for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
            if (attempt > 0) {
                const delay = getBackoffDelay(attempt - 1);
                console.log(`[retry] 第 ${attempt} 次重试，等待 ${delay}ms ...`);
                await sleep(delay);
            }

            try {
                const result = await new Promise((res, rej) => {
                    const urlObj = new URL(url);
                    const options = {
                        hostname: urlObj.hostname,
                        port: urlObj.port || 80,
                        path: urlObj.pathname,
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                    };

                    const req = http.request(
                        options,
                        (response) => {
                            let responseBody = '';
                            response.on('data', (chunk) => {
                                responseBody += chunk.toString();
                            });
                            response.on('end', () => {
                                res({ statusCode: response.statusCode || 0, body: responseBody });
                            });
                            response.on('error', rej);
                        }
                    );

                    req.on('error', rej);
                    req.setTimeout(timeoutMs, () => {
                        req.destroy();
                        rej(new Error(`请求超时 (${timeoutMs / 1000}s)`));
                    });

                    req.write(jsonBody);
                    req.end();
                });

                if (
                    RETRY_CONFIG.retryableStatusCodes.includes(result.statusCode) &&
                    attempt < RETRY_CONFIG.maxRetries
                ) {
                    console.warn(`[retry] Ollama 返回 ${result.statusCode}，将重试 (${attempt + 1}/${RETRY_CONFIG.maxRetries})`);
                    lastError = new Error(`Ollama API 错误: ${result.statusCode}`);
                    continue;
                }

                resolve(result);
                return;
            } catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err));
                if (attempt < RETRY_CONFIG.maxRetries) {
                    console.warn(`[retry] 请求异常: ${lastError.message}，将重试 (${attempt + 1}/${RETRY_CONFIG.maxRetries})`);
                    continue;
                }
            }
        }
        reject(lastError || new Error('所有重试均失败'));
    });
}

function ollamaStreamWithRetry(
    url,
    body,
    timeoutMs = 30000,
    onStream,
    onError
) {
    let attempt = 0;
    const jsonBody = JSON.stringify(body);

    function tryRequest() {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || 80,
            path: urlObj.pathname,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        };

        const req = http.request(
            options,
            (res) => {
                const status = res.statusCode || 0;

                if (
                    RETRY_CONFIG.retryableStatusCodes.includes(status) &&
                    attempt < RETRY_CONFIG.maxRetries
                ) {
                    res.resume();
                    attempt++;
                    const delay = getBackoffDelay(attempt - 1);
                    console.warn(`[retry-stream] Ollama 返回 ${status}，第 ${attempt} 次重试，等待 ${delay}ms ...`);
                    setTimeout(tryRequest, delay);
                    return;
                }

                onStream(res);
            }
        );

        req.on('error', (err) => {
            if (attempt < RETRY_CONFIG.maxRetries) {
                attempt++;
                const delay = getBackoffDelay(attempt - 1);
                console.warn(`[retry-stream] 请求异常: ${err.message}，第 ${attempt} 次重试，等待 ${delay}ms ...`);
                setTimeout(tryRequest, delay);
                return;
            }
            onError(err);
        });

        req.setTimeout(timeoutMs, () => {
            req.destroy();
            if (attempt < RETRY_CONFIG.maxRetries) {
                attempt++;
                const delay = getBackoffDelay(attempt - 1);
                console.warn(`[retry-stream] 请求超时，第 ${attempt} 次重试，等待 ${delay}ms ...`);
                setTimeout(tryRequest, delay);
                return;
            }
            onError(new Error(`请求超时 (${timeoutMs / 1000}s)`));
        });

        req.write(jsonBody);
        req.end();
    }

    tryRequest();
}

// ============================================================
// API Routes
// ============================================================

// 1. CORS Proxy (Unchanged)
app.get('/api/proxy', (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        res.status(400).json({ error: '缺少 url 参数' });
        return;
    }

    let parsed;
    try {
        parsed = new URL(targetUrl);
    } catch {
        res.status(400).json({ error: '无效的 URL' });
        return;
    }

    const client = parsed.protocol === 'https:' ? https : http;
    const proxyReq = client.get(
        targetUrl,
        {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Accept-Encoding': 'identity',
                'Referer': parsed.origin + '/',
            },
        },
        (proxyRes) => {
            if (
                proxyRes.statusCode &&
                proxyRes.statusCode >= 300 &&
                proxyRes.statusCode < 400 &&
                proxyRes.headers.location
            ) {
                const redirectUrl = new URL(proxyRes.headers.location, targetUrl).toString();
                res.redirect(`/api/proxy?url=${encodeURIComponent(redirectUrl)}`);
                return;
            }

            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'text/html');
            res.statusCode = proxyRes.statusCode || 200;
            proxyRes.pipe(res);
        }
    );

    proxyReq.on('error', (err) => {
        console.error('[proxy] Error:', err.message);
        if (!res.headersSent) res.status(502).json({ error: `Proxy Error: ${err.message}` });
    });

    proxyReq.setTimeout(15000, () => {
        proxyReq.destroy();
        if (!res.headersSent) res.status(504).json({ error: 'Proxy Timeout' });
    });
});

// 2. Image Proxy (Unchanged)
app.get('/api/img-proxy', (req, res) => {
    const targetUrl = req.query.url;
    const referer = req.query.referer;

    if (!targetUrl) {
        res.status(400).send('Missing url');
        return;
    }

    let parsed;
    try {
        parsed = new URL(targetUrl);
    } catch {
        res.status(400).send('Invalid URL');
        return;
    }

    const client = parsed.protocol === 'https:' ? https : http;
    const proxyReq = client.get(
        targetUrl,
        {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Referer': referer || parsed.origin + '/',
                'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
            },
        },
        (proxyRes) => {
            if (proxyRes.statusCode && proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
                const redirectUrl = new URL(proxyRes.headers.location, targetUrl).toString();
                res.redirect(`/api/img-proxy?url=${encodeURIComponent(redirectUrl)}&referer=${encodeURIComponent(referer)}`);
                return;
            }

            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'image/jpeg');
            res.setHeader('Cache-Control', 'public, max-age=31536000');

            proxyRes.pipe(res);
        }
    );

    proxyReq.on('error', (err) => {
        if (!res.headersSent) res.status(500).send('Image Proxy Error');
    });
});

// 3. AI Chat (Ollama SSE)
app.post('/api/chat', (req, res) => {
    const { messages } = req.body;

    const ollamaBody = {
        model: OLLAMA_MODEL,
        messages: messages.map(m => ({
            role: m.role,
            content: m.content
        })),
        stream: true,
    };

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    ollamaStreamWithRetry(
        OLLAMA_CHAT_API,
        ollamaBody,
        60000,
        (ollamaRes) => {
            if (ollamaRes.statusCode !== 200) {
                let errBody = '';
                ollamaRes.on('data', c => errBody += c);
                ollamaRes.on('end', () => {
                    console.error('[ai-chat] API Error:', ollamaRes.statusCode, errBody);
                    res.write(`data: ${JSON.stringify({ error: `Ollama Error: ${ollamaRes.statusCode}` })}\n\n`);
                    res.write('data: [DONE]\n\n');
                    res.end();
                });
                return;
            }

            let buffer = '';
            ollamaRes.on('data', (chunk) => {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const data = JSON.parse(line);
                        const text = data?.message?.content;
                        if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
                        if (data.done) {
                            res.write('data: [DONE]\n\n');
                            res.end();
                            return;
                        }
                    } catch (e) {
                        // ignore
                    }
                }
            });

            ollamaRes.on('end', () => {
                if (!res.writableEnded) {
                    res.write('data: [DONE]\n\n');
                    res.end();
                }
            });

            ollamaRes.on('error', (err) => {
                console.error('[ai-chat] Stream Error:', err.message);
                res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
                res.write('data: [DONE]\n\n');
                res.end();
            });
        },
        (err) => {
            console.error('[ai-chat] All retries failed:', err.message);
            res.write(`data: ${JSON.stringify({ error: `Request failed: ${err.message}` })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
        }
    );
});

// 4. AI Translate (Ollama)
app.post('/api/translate', async (req, res) => {
    const { content, targetLanguage } = req.body;
    if (!content) return res.status(400).json({ error: 'Missing content' });

    const lang = targetLanguage || '中文';
    const systemPrompt = `You are a professional translator. Translate the following Markdown content to ${lang}. Rules: 1. Keep Markdown formatting. 2. DO NOT translate code blocks. 3. Output ONLY translated text.`;

    try {
        const ollamaBody = {
            model: OLLAMA_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: content.slice(0, 8000) } // Increased limit for local LLM
            ],
            stream: false,
            options: { temperature: 0.3, num_ctx: 8192 } // Increased context window
        };

        const result = await ollamaRequestWithRetry(
            OLLAMA_CHAT_API,
            ollamaBody,
            120000
        );

        if (result.statusCode !== 200) throw new Error(`Ollama Error: ${result.statusCode}`);
        const data = JSON.parse(result.body);
        const text = data?.message?.content || '';

        res.json({ translatedContent: text });

    } catch (err) {
        res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
});

// 5. AI Tags (Ollama)
app.post('/api/tags', async (req, res) => {
    const { title, content } = req.body;
    if (!content) return res.status(400).json({ error: 'Missing content' });

    const systemPrompt = `You are an expert article classifier. Analyze the title and summary to extract 1-3 core technical tags. Rules: 1. Short (2-4 words). 2. Return ONLY tags, comma-separated. 3. No other text.`;

    try {
        const ollamaBody = {
            model: OLLAMA_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Title: ${title}\n\nSummary: ${content.slice(0, 1000)}` }
            ],
            stream: false,
            options: { temperature: 0.2 }
        };

        const result = await ollamaRequestWithRetry(
            OLLAMA_CHAT_API,
            ollamaBody,
            30000
        );

        if (result.statusCode !== 200) throw new Error(`Ollama Error: ${result.statusCode}`);
        const data = JSON.parse(result.body);
        const rawText = data?.message?.content || '';
        const tags = rawText.split(/[,，]/).map((t) => t.trim()).filter((t) => t.length > 0);

        res.json({ tags });
    } catch (err) {
        res.status(502).json({ error: String(err) });
    }
});

// ============================================================
// OpenAI-Compatible LLM Proxy (Avoid Browser CORS)
// - Used by frontend for: chat streaming, non-stream calls, and connection tests
// - Similar to /api/kb/chat but without RAG augmentation
// ============================================================

function normalizeBaseUrl(input) {
    const endpoint = String(input || '').trim();
    return endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
}

function ensureHttpUrl(urlStr) {
    let parsed;
    try {
        parsed = new URL(urlStr);
    } catch {
        throw new Error('Invalid Base URL');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Base URL must be http(s)');
    }
    return parsed;
}

function isLikelyOllamaNative(endpoint) {
    // Heuristic: Ollama native endpoints typically live at :11434 without /v1.
    return endpoint.includes('11434') && !endpoint.includes('/v1');
}

function buildLegacyPrompt(messages) {
    return messages.map(m => `${m.role}: ${m.content}`).join('\n') + '\nassistant:';
}

async function readResponseTextSafe(resp) {
    try {
        return await resp.text();
    } catch {
        return '';
    }
}

async function fetchJsonWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const resp = await fetch(url, { ...options, signal: controller.signal });
        const text = await readResponseTextSafe(resp);
        let json = null;
        if (text) {
            try { json = JSON.parse(text); } catch { /* ignore */ }
        }
        return { resp, text, json };
    } finally {
        clearTimeout(timeoutId);
    }
}

// LLM Connectivity Test (chat or embedding) - server-side to avoid CORS
app.post('/api/llm/test', async (req, res) => {
    try {
        const { target, settings } = req.body || {};
        const which = String(target || '').trim();
        if (which !== 'chat' && which !== 'embedding') {
            return res.status(400).json({ ok: false, error: 'Missing target (chat|embedding)' });
        }
        if (!settings || typeof settings !== 'object') {
            return res.status(400).json({ ok: false, error: 'Missing settings' });
        }

        if (which === 'chat') {
            const baseUrl = normalizeBaseUrl(settings.baseUrl);
            const apiKey = String(settings.apiKey || '');
            const modelName = String(settings.modelName || '');
            const protocol = String(settings.protocol || 'chat'); // 'chat' | 'legacy'

            if (!baseUrl) return res.status(400).json({ ok: false, error: 'Missing chat Base URL' });
            if (!modelName) return res.status(400).json({ ok: false, error: 'Missing chat model name' });

            ensureHttpUrl(baseUrl);

            const headers = { 'Content-Type': 'application/json' };
            if (apiKey.trim()) headers['Authorization'] = `Bearer ${apiKey.trim()}`;

            const messages = [{ role: 'user', content: 'Hi' }];
            const isOllamaNative = isLikelyOllamaNative(baseUrl);

            let finalUrl = '';
            let body = {};

            if (isOllamaNative) {
                finalUrl = `${baseUrl}/api/chat`;
                body = { model: modelName, messages, stream: false };
            } else if (protocol === 'legacy') {
                finalUrl = `${baseUrl}/completions`;
                body = { model: modelName, prompt: buildLegacyPrompt(messages), max_tokens: 5 };
            } else {
                finalUrl = `${baseUrl}/chat/completions`;
                body = { model: modelName, messages, max_tokens: 5 };
            }

            const { resp, text, json } = await fetchJsonWithTimeout(
                finalUrl,
                { method: 'POST', headers, body: JSON.stringify(body) },
                8000
            );

            if (!resp.ok) {
                const detail = text ? text.slice(0, 180) : '';
                return res.status(resp.status).json({ ok: false, error: `Chat LLM Error: HTTP ${resp.status}${detail ? ` - ${detail}` : ''}` });
            }
            // Minimal sanity check: JSON is parseable
            if (!json) {
                if ((text || '').trim().startsWith('<')) {
                    return res.status(502).json({ ok: false, error: 'Received HTML instead of API JSON. Check Base URL (maybe missing /v1).' });
                }
                return res.status(502).json({ ok: false, error: 'Failed to parse JSON response from chat endpoint.' });
            }

            return res.json({ ok: true });
        }

        // embedding test
        const embeddingBaseUrl = normalizeBaseUrl(settings.embeddingBaseUrl);
        const embeddingApiKey = String(settings.embeddingApiKey || '');
        const embeddingModelName = String(settings.embeddingModelName || '');

        if (!embeddingBaseUrl) return res.status(400).json({ ok: false, error: 'Missing embedding Base URL' });
        if (!embeddingModelName) return res.status(400).json({ ok: false, error: 'Missing embedding model name' });

        ensureHttpUrl(embeddingBaseUrl);

        const isOllamaNative = isLikelyOllamaNative(embeddingBaseUrl);
        const finalUrl = isOllamaNative ? `${embeddingBaseUrl}/api/embeddings` : `${embeddingBaseUrl}/embeddings`;

        const headers = { 'Content-Type': 'application/json' };
        if (embeddingApiKey.trim()) headers['Authorization'] = `Bearer ${embeddingApiKey.trim()}`;

        const body = isOllamaNative
            ? { model: embeddingModelName, prompt: 'ping' }
            : { model: embeddingModelName, input: 'ping' };

        const { resp, text, json } = await fetchJsonWithTimeout(
            finalUrl,
            { method: 'POST', headers, body: JSON.stringify(body) },
            8000
        );

        if (!resp.ok) {
            const detail = text ? text.slice(0, 180) : '';
            return res.status(resp.status).json({ ok: false, error: `Embedding Error: HTTP ${resp.status}${detail ? ` - ${detail}` : ''}` });
        }
        if (!json) {
            return res.status(502).json({ ok: false, error: 'Failed to parse JSON response from embedding endpoint.' });
        }

        // Minimal vector presence check (supports Ollama native + OpenAI)
        const vector = isOllamaNative ? json.embedding : json.data?.[0]?.embedding;
        if (!Array.isArray(vector) || vector.length === 0) {
            return res.status(502).json({ ok: false, error: 'Embedding endpoint returned no vector.' });
        }

        return res.json({ ok: true, dim: vector.length });
    } catch (err) {
        return res.status(502).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
});

// Non-stream LLM call (chat/legacy) - returns plain content
app.post('/api/llm/complete', async (req, res) => {
    try {
        const { messages } = req.body || {};
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ error: 'Missing messages' });
        }

        const chatBaseUrl = req.headers['x-chat-url'] || OLLAMA_HOST;
        const chatApiKey = req.headers['x-chat-key'] || '';
        const chatModel = req.headers['x-chat-model'] || OLLAMA_MODEL;
        const chatProtocol = req.headers['x-chat-protocol'] || 'chat';

        let endpoint = normalizeBaseUrl(chatBaseUrl);
        ensureHttpUrl(endpoint);

        const isOllamaNative = isLikelyOllamaNative(endpoint);
        const headers = { 'Content-Type': 'application/json' };
        if (String(chatApiKey).trim()) headers['Authorization'] = `Bearer ${String(chatApiKey).trim()}`;

        let finalUrl = '';
        let body = {};

        if (isOllamaNative) {
            finalUrl = `${endpoint}/api/chat`;
            body = { model: chatModel, messages, stream: false };
        } else if (chatProtocol === 'legacy') {
            finalUrl = `${endpoint}/completions`;
            body = { model: chatModel, prompt: buildLegacyPrompt(messages), stream: false };
        } else {
            finalUrl = `${endpoint}/chat/completions`;
            body = { model: chatModel, messages, stream: false };
        }

        const { resp, text, json } = await fetchJsonWithTimeout(
            finalUrl,
            { method: 'POST', headers, body: JSON.stringify(body) },
            120000
        );

        if (!resp.ok) {
            return res.status(resp.status).json({ error: `LLM Error: HTTP ${resp.status} - ${text.slice(0, 300)}` });
        }
        if (!json) {
            return res.status(502).json({ error: 'Failed to parse LLM JSON response' });
        }

        let content = '';
        if (isOllamaNative) {
            content = json?.message?.content || '';
        } else if (chatProtocol === 'legacy') {
            content = json?.choices?.[0]?.text || '';
        } else {
            content = json?.choices?.[0]?.message?.content || '';
        }

        return res.json({ content });
    } catch (err) {
        return res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
});

// Stream LLM response as SSE: data: {"text":"..."}\n\n and data: [DONE]\n\n
app.post('/api/llm/chat', async (req, res) => {
    try {
        const { messages } = req.body || {};
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ error: 'Missing messages' });
        }

        const chatBaseUrl = req.headers['x-chat-url'] || OLLAMA_HOST;
        const chatApiKey = req.headers['x-chat-key'] || '';
        const chatModel = req.headers['x-chat-model'] || OLLAMA_MODEL;
        const chatProtocol = req.headers['x-chat-protocol'] || 'chat';

        let endpoint = normalizeBaseUrl(chatBaseUrl);
        ensureHttpUrl(endpoint);

        const isOllamaNative = isLikelyOllamaNative(endpoint);
        const headers = { 'Content-Type': 'application/json' };
        if (String(chatApiKey).trim()) headers['Authorization'] = `Bearer ${String(chatApiKey).trim()}`;

        let finalChatUrl = '';
        let finalChatBody = {};

        if (isOllamaNative) {
            finalChatUrl = `${endpoint}/api/chat`;
            finalChatBody = {
                model: chatModel,
                messages,
                stream: true
            };
        } else {
            finalChatUrl = chatProtocol === 'legacy' ? `${endpoint}/completions` : `${endpoint}/chat/completions`;
            finalChatBody = {
                model: chatModel,
                stream: true,
            };
            if (chatProtocol === 'legacy') {
                finalChatBody.prompt = buildLegacyPrompt(messages);
            } else {
                finalChatBody.messages = messages;
            }
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');

        const llmReq = await fetch(finalChatUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(finalChatBody)
        });

        if (!llmReq.ok) {
            const err = await readResponseTextSafe(llmReq);
            res.write(`data: ${JSON.stringify({ error: `Chat LLM Error: ${llmReq.status} - ${err}` })}\n\n`);
            res.write('data: [DONE]\n\n');
            return res.end();
        }

        const reader = llmReq.body?.getReader();
        if (!reader) {
            res.write(`data: ${JSON.stringify({ error: 'No readable stream from LLM response.' })}\n\n`);
            res.write('data: [DONE]\n\n');
            return res.end();
        }

        const decoder = new TextDecoder("utf-8");
        let buffer = '';

        const emitText = (text) => {
            if (!text) return;
            res.write(`data: ${JSON.stringify({ text })}\n\n`);
        };

        const handleLine = (line) => {
            const trimmed = String(line || '').trim();
            if (!trimmed) return;

            // OpenAI-style SSE
            if (trimmed.startsWith('data:')) {
                const dataStr = trimmed.replace(/^data:/, '').trim();
                if (dataStr === '[DONE]') {
                    res.write('data: [DONE]\n\n');
                    return;
                }
                try {
                    const parsed = JSON.parse(dataStr);
                    // Chat completions streaming
                    if (parsed.choices?.[0]?.delta?.content) {
                        emitText(parsed.choices[0].delta.content);
                    }
                    // Legacy completions streaming
                    else if (parsed.choices?.[0]?.text) {
                        emitText(parsed.choices[0].text);
                    }
                } catch {
                    // ignore chunking breaks
                }
                return;
            }

            // Ollama native: NDJSON lines
            if (trimmed.startsWith('{')) {
                try {
                    const d = JSON.parse(trimmed);
                    if (d.message?.content) emitText(d.message.content);
                    if (d.done) res.write('data: [DONE]\n\n');
                } catch {
                    // ignore
                }
            }
        };

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) handleLine(line);
        }
        if (buffer) handleLine(buffer);

        res.write('data: [DONE]\n\n');
        res.end();
    } catch (err) {
        console.error('[LLM Chat Proxy Error]', err);
        if (!res.headersSent) {
            res.status(500).json({ error: String(err) });
        } else {
            res.write(`data: ${JSON.stringify({ error: String(err) })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
        }
    }
});

// 6. Knowledge Base Upload (RAG)
app.post('/api/kb/upload', upload.single('file'), async (req, res) => {
    try {
        const file = req.file;
        if (!file) {
            console.error('[KB Upload] Error: No file uploaded. req.file is undefined.');
            return res.status(400).json({ error: 'No file uploaded to serve. Please check if your form field name is "file".' });
        }

        // Parse custom embedding config from headers or body
        // Example: pass "X-Embedding-Url" from frontend settings
        const embeddingBaseUrl = req.headers['x-embedding-url'] || process.env.EMBEDDING_BASE_URL || OLLAMA_HOST;
        const embeddingApiKey = req.headers['x-embedding-key'] || process.env.EMBEDDING_API_KEY || '';
        const embeddingModel = req.headers['x-embedding-model'] || process.env.EMBEDDING_MODEL_NAME || 'nomic-embed-text';

        if (!qdrantReady) {
            console.log('[KB Upload] Qdrant not ready, trying to reconnect...');
            await ensureCollection();
            if (!qdrantReady) {
                throw new Error(`向量数据库 (Qdrant) 未连接，请确保 Qdrant 已在 ${QDRANT_URL} 启动。如果你正在本地运行，请先启动 Docker 中的 Qdrant 服务。`);
            }
        }

        console.log(`[KB Upload] Processing ${file.originalname} using model ${embeddingModel}`);

        // 1. Extract text from document based on extension
        const ext = path.extname(file.originalname).toLowerCase();
        let fullText = '';

        if (ext === '.pdf') {
            const pdfBuffer = fs.readFileSync(file.path);
            // pdf-parse v2+ uses the PDFParse class
            const parser = new PDFParse({ data: pdfBuffer });
            const result = await parser.getText();
            fullText = result.text;
            await parser.destroy();
        } else if (ext === '.docx') {
            const result = await mammoth.extractRawText({ path: file.path });
            fullText = result.value;
        } else {
            // .txt, .md, or any plain text
            fullText = fs.readFileSync(file.path, 'utf-8');
        }

        if (!fullText.trim()) {
            throw new Error('无法从文件中提取文本内容，请检查文件格式');
        }

        // 2. Split text into overlapping chunks (inline implementation)
        const CHUNK_SIZE = 500;
        const CHUNK_OVERLAP = 50;
        const chunks = [];
        let start = 0;
        while (start < fullText.length) {
            const end = Math.min(start + CHUNK_SIZE, fullText.length);
            chunks.push(fullText.slice(start, end).trim());
            if (end >= fullText.length) break;
            start += CHUNK_SIZE - CHUNK_OVERLAP;
        }
        // Filter out tiny chunks
        const validChunks = chunks.filter(c => c.length > 20);
        console.log(`[KB Upload] Split into ${validChunks.length} chunks`);

        // 3. Generate embeddings & upload to Qdrant
        let endpoint = embeddingBaseUrl.trim();
        if (endpoint.endsWith('/')) endpoint = endpoint.slice(0, -1);

        // Handle Ollama compat vs OpenAI standard embedding endpoints
        const isOllamaPath = endpoint.includes('11434') && !endpoint.includes('/v1');
        const finalUrl = isOllamaPath ? `${endpoint}/api/embeddings` : `${endpoint}/embeddings`;

        const headers = { 'Content-Type': 'application/json' };
        if (embeddingApiKey.trim()) {
            headers['Authorization'] = `Bearer ${embeddingApiKey.trim()}`;
        }

        const points = [];
        for (let i = 0; i < validChunks.length; i++) {
            const chunkText = validChunks[i];
            const body = isOllamaPath
                ? { model: embeddingModel, prompt: chunkText }
                : { model: embeddingModel, input: chunkText };

            const embedRes = await fetch(finalUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(body)
            });

            if (!embedRes.ok) {
                const errTxt = await embedRes.text();
                throw new Error(`Embedding failed for chunk ${i}: ${embedRes.status} - ${errTxt}`);
            }

            const embedData = await embedRes.json();
            const vector = isOllamaPath ? embedData.embedding : embedData.data[0].embedding;

            points.push({
                id: crypto.randomUUID(),
                vector: vector,
                payload: {
                    content: chunkText,
                    source: file.originalname,
                    chunk_index: i
                }
            });

            // tiny delay to prevent local LLM overload
            await sleep(100);
        }

        // Upsert to Qdrant
        await qdrantClient.upsert(COLLECTION_NAME, {
            wait: true,
            points: points
        });

        // Cleanup local uploaded file
        fs.unlinkSync(file.path);

        res.json({
            success: true,
            message: `Successfully indexed ${file.originalname}`,
            chunks: validChunks.length
        });
    } catch (err) {
        console.error('[KB Upload Error]', err);
        // Ensure cleanup even on error
        if (req.file?.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: String(err) });
    }
});

// 7. Knowledge Base Delete
app.delete('/api/kb/delete', async (req, res) => {
    try {
        const { source } = req.body;
        if (!source) return res.status(400).json({ error: 'Source filename is required' });

        if (!qdrantReady) {
            await ensureCollection();
            if (!qdrantReady) throw new Error('向量数据库 (Qdrant) 未连接');
        }

        console.log(`[KB Delete] Deleting records for source: ${source}`);
        await qdrantClient.delete(COLLECTION_NAME, {
            filter: {
                must: [{ key: 'source', match: { value: source } }]
            }
        });

        res.json({ success: true, message: `已从知识库删除 ${source}` });
    } catch (err) {
        console.error('[KB Delete Error]', err);
        res.status(500).json({ error: String(err) });
    }
});

// 7. Knowledge Base Chat (RAG Retrieval)
app.post('/api/kb/chat', async (req, res) => {
    try {
        const { messages } = req.body;
        if (!messages || messages.length === 0) {
            return res.status(400).json({ error: 'Missing messages' });
        }

        // Get the last user message for embedding search
        const lastMessage = messages[messages.length - 1].content;

        // Custom configs for both chat and embedding
        const chatBaseUrl = req.headers['x-chat-url'] || OLLAMA_HOST;
        const chatApiKey = req.headers['x-chat-key'] || '';
        const chatModel = req.headers['x-chat-model'] || OLLAMA_MODEL;
        const chatProtocol = req.headers['x-chat-protocol'] || 'chat'; // 'chat' or 'legacy'

        const embeddingBaseUrl = req.headers['x-embedding-url'] || process.env.EMBEDDING_BASE_URL || OLLAMA_HOST;
        const embeddingApiKey = req.headers['x-embedding-key'] || process.env.EMBEDDING_API_KEY || '';
        const embeddingModel = req.headers['x-embedding-model'] || process.env.EMBEDDING_MODEL_NAME || 'nomic-embed-text';

        // 1. Generate embedding for query
        let embedEndpoint = embeddingBaseUrl.trim();
        if (embedEndpoint.endsWith('/')) embedEndpoint = embedEndpoint.slice(0, -1);
        const isOllamaEmbed = embedEndpoint.includes('11434') && !embedEndpoint.includes('/v1');
        const embedUrl = isOllamaEmbed ? `${embedEndpoint}/api/embeddings` : `${embedEndpoint}/embeddings`;

        const embedHeaders = { 'Content-Type': 'application/json' };
        if (embeddingApiKey.trim()) embedHeaders['Authorization'] = `Bearer ${embeddingApiKey.trim()}`;

        const embedBody = isOllamaEmbed
            ? { model: embeddingModel, prompt: lastMessage }
            : { model: embeddingModel, input: lastMessage };

        const embedRes = await fetch(embedUrl, { method: 'POST', headers: embedHeaders, body: JSON.stringify(embedBody) });
        if (!embedRes.ok) throw new Error(`Query embedding failed: ${await embedRes.text()}`);

        const embedData = await embedRes.json();
        const queryVector = isOllamaEmbed ? embedData.embedding : embedData.data[0].embedding;

        // 2. Search Qdrant
        const searchRes = await qdrantClient.search(COLLECTION_NAME, {
            vector: queryVector,
            limit: 3, // Top K
            with_payload: true,
            // score_threshold: 0.5 // Removed because cosine range varies
        });

        console.log(`[KB Chat] Search found ${searchRes.length} results for query.`);

        const contextTexts = searchRes.map(hit => `[source: ${hit.payload.source}] ${hit.payload.content}`).join('\n\n');

        // 3. Construct Augmented Prompt
        const systemPrompt = `你是一个专业的本地知识库 AI 助手。请**严格**基于以下提供的参考资料（Context）来回答用户的问题。如果参考资料中没有相关信息，请明确回答“抱歉，在知识库中未找到相关答案。”，绝不要编造内容。使用中文回答，如果涉及代码，请使用 Markdown 格式。\n\n--- 参考资料 (Context) ---\n${contextTexts}\n-----------------------\n`;

        const augmentedMessages = [
            { role: 'system', content: systemPrompt },
            ...messages
        ];

        // 4. Stream response using specified Chat LLM limits
        let chatEndpoint = chatBaseUrl.trim();
        if (chatEndpoint.endsWith('/')) chatEndpoint = chatEndpoint.slice(0, -1);

        const isChatOllama = chatEndpoint.includes('11434') && !chatEndpoint.includes('/v1');
        let finalChatUrl = '';
        let finalChatBody = {};

        if (isChatOllama) {
            finalChatUrl = `${chatEndpoint}/api/chat`;
            finalChatBody = {
                model: chatModel,
                messages: augmentedMessages,
                stream: true
            };
        } else {
            finalChatUrl = chatProtocol === 'chat' ? `${chatEndpoint}/chat/completions` : `${chatEndpoint}/completions`;
            finalChatBody = {
                model: chatModel,
                stream: true,
            };
            if (chatProtocol === 'chat') {
                finalChatBody.messages = augmentedMessages;
            } else {
                finalChatBody.prompt = augmentedMessages.map(m => `${m.role}: ${m.content}`).join('\n') + '\nassistant:';
            }
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Use Node fetch to stream (instead of ollamaStreamWithRetry which is coupled to old format slightly)
        const chatHeaders = { 'Content-Type': 'application/json' };
        if (chatApiKey.trim()) chatHeaders['Authorization'] = `Bearer ${chatApiKey.trim()}`;

        const llmReq = await fetch(finalChatUrl, {
            method: 'POST',
            headers: chatHeaders,
            body: JSON.stringify(finalChatBody)
        });

        if (!llmReq.ok) {
            const err = await llmReq.text();
            res.write(`data: ${JSON.stringify({ error: `Chat LLM Error: ${llmReq.status} - ${err}` })}\n\n`);
            res.write('data: [DONE]\n\n');
            return res.end();
        }

        // Extremely native stream piping to SSE
        const reader = llmReq.body.getReader();
        const decoder = new TextDecoder("utf-8");

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (!line.trim().startsWith('data:')) {
                    if (line.trim().startsWith('{')) { // bare json objects (old ollama)
                        try {
                            const d = JSON.parse(line.trim());
                            if (d.message?.content) res.write(`data: ${JSON.stringify({ text: d.message.content })}\n\n`);
                            if (d.done) { res.write('data: [DONE]\n\n'); }
                        } catch (e) { }
                    }
                    continue;
                }

                const dataStr = line.replace(/^data:/, '').trim();
                if (dataStr === '[DONE]') {
                    res.write('data: [DONE]\n\n');
                    continue;
                }

                try {
                    const parsed = JSON.parse(dataStr);
                    // Standard OpenAI
                    if (parsed.choices && parsed.choices.length > 0 && parsed.choices[0].delta?.content) {
                        res.write(`data: ${JSON.stringify({ text: parsed.choices[0].delta.content })}\n\n`);
                    }
                    // Or Ollama
                    else if (parsed.message?.content) {
                        res.write(`data: ${JSON.stringify({ text: parsed.message.content })}\n\n`);
                    }
                } catch (e) { /* ignore chunking breaks */ }
            }
        }
        res.write('data: [DONE]\n\n');
        res.end();

    } catch (err) {
        console.error('[KB Chat Error]', err);
        if (!res.headersSent) {
            res.status(500).json({ error: String(err) });
        } else {
            res.write(`data: ${JSON.stringify({ error: String(err) })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
        }
    }
});

// 7. Generic Error Handler (Catch Multer/Express errors)
app.use((err, req, res, next) => {
    console.error('[Global Error]', err);
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `Multer Error: ${err.message}` });
    }
    res.status(500).json({ error: String(err.message || err) });
});

// Start Server
app.listen(PORT, () => {
    console.log(`Scraper server running on port ${PORT}`);
});
