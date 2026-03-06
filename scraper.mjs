import express from 'express';
import cors from 'cors';
import http from 'http';
import https from 'https';
import { URL } from 'url';

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

// ============================================================
// Ollama Local API Configuration
// ============================================================
let ollamaHostValue = process.env.OLLAMA_HOST || 'http://localhost:11434';
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

// 6. AI Draft (Ollama)
app.post('/api/generate-draft', async (req, res) => {
    const { content, type } = req.body;
    if (!content) return res.status(400).json({ error: 'Missing content' });

    const PROMPTS = {
        blog: `You are a senior tech blogger. Write an engaging technical blog post based on the provided content. Requirements: 1. Catchy title with Emojis. 2. Clear structure: Intro, Core Points (with code if applicable), Summary. 3. Humorous yet professional tone. 4. Output in Markdown.`,
        summary: `You are an academic assistant. Generate a structured reading note. Requirements: 1. Core Concepts. 2. Key Logic Analysis. 3. Takeaways (List). 4. Unresolved Questions. 5. Output in Markdown.`
    };

    const systemPrompt = PROMPTS[type] || PROMPTS.blog;
    const excerpt = content.slice(0, 5000);

    try {
        const ollamaBody = {
            model: OLLAMA_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: excerpt }
            ],
            stream: false,
            options: { temperature: 0.7 }
        };

        const result = await ollamaRequestWithRetry(
            OLLAMA_CHAT_API,
            ollamaBody,
            120000
        );

        if (result.statusCode !== 200) throw new Error(`Ollama Error: ${result.statusCode}`);
        const data = JSON.parse(result.body);
        const draft = data?.message?.content || '';

        res.json({ draft });
    } catch (err) {
        res.status(502).json({ error: String(err) });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Scraper server running on port ${PORT}`);
});
