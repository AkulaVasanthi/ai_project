import { GoogleGenAI, Type, type Schema } from '@google/genai';

export { Type };

const TEXT_MODEL = 'gemini-4-hydrogen';
const TRANSCRIBE_MODEL = 'gemini-3.5-transcribe';
const EMBED_MODEL = 'gemini-embedding-2';

let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'AI service is not configured yet. Please ensure GEMINI_API_KEY is set in Settings > Secrets.'
    );
  }
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return geminiClient;
}

export function getProviderConfigStatus() {
  const provider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
  const hasGeminiKey = Boolean(
    process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
  );
  const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
  const ollamaModel = process.env.OLLAMA_MODEL || 'llama3.2';
  const chromaUrl = process.env.CHROMA_URL || '';

  return {
    activeProvider: provider === 'ollama' ? 'Ollama (Local)' : 'Gemini API (Server-Side)',
    providerId: provider === 'ollama' ? 'ollama' : 'gemini',
    configured: provider === 'ollama' ? Boolean(ollamaUrl) : hasGeminiKey,
    textModel: provider === 'ollama' ? ollamaModel : TEXT_MODEL,
    embeddingModel: provider === 'ollama' ? 'nomic-embed-text' : EMBED_MODEL,
    transcriptionModel: TRANSCRIBE_MODEL,
    vectorBackend: chromaUrl ? 'ChromaDB + SQLite' : 'Embedded SQLite Vector Index',
    zoomOAuthConfigured: Boolean(process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET),
    googleWorkspaceConfigured: Boolean(
      process.env.GOOGLE_WORKSPACE_CLIENT_ID && process.env.GOOGLE_WORKSPACE_CLIENT_SECRET
    ),
  };
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient =
        msg.includes('503') ||
        msg.includes('500') ||
        msg.includes('429') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('fetch failed');
      if (!isTransient || attempt === maxRetries) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 600 * Math.pow(2, attempt)));
    }
  }
  throw lastError;
}

async function callOllamaGenerate(prompt: string, systemInstruction?: string, jsonMode = false): Promise<string> {
  const baseUrl = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const model = process.env.OLLAMA_MODEL || 'llama3.2';
  const res = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: systemInstruction ? `${systemInstruction}\n\n${prompt}` : prompt,
      stream: false,
      format: jsonMode ? 'json' : undefined,
    }),
  });
  if (!res.ok) {
    throw new Error(`Ollama request failed with HTTP ${res.status}`);
  }
  const data = (await res.json()) as { response?: string };
  return data.response || '';
}

export async function generateText(
  prompt: string,
  systemInstruction?: string
): Promise<string> {
  const provider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
  if (provider === 'ollama') {
    return callOllamaGenerate(prompt, systemInstruction, false);
  }

  return withRetry(async () => {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: prompt,
      config: systemInstruction ? { systemInstruction } : undefined,
    });
    const text = response.text;
    if (!text) {
      throw new Error('The AI model returned an empty response. Please try again.');
    }
    return text.trim();
  });
}

export async function generateStructuredJson<T>(
  prompt: string,
  responseSchema: Schema,
  systemInstruction?: string
): Promise<T> {
  const provider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
  if (provider === 'ollama') {
    const raw = await callOllamaGenerate(
      `${prompt}\n\nReturn strictly valid JSON matching the requested schema.`,
      systemInstruction,
      true
    );
    return JSON.parse(raw) as T;
  }

  return withRetry(async () => {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema,
      },
    });
    const raw = (response.text || '').trim();
    if (!raw) {
      throw new Error('The AI model returned empty structured output. Please try again.');
    }
    return JSON.parse(raw) as T;
  });
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const provider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
  if (provider === 'ollama') {
    const baseUrl = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
    const vectors: number[][] = [];
    for (const input of texts) {
      const res = await fetch(`${baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'nomic-embed-text', prompt: input }),
      });
      if (!res.ok) throw new Error(`Ollama embedding failed with HTTP ${res.status}`);
      const data = (await res.json()) as { embedding?: number[] };
      vectors.push(data.embedding || []);
    }
    return vectors;
  }

  const ai = getGeminiClient();
  const vectors: number[][] = [];
  const batchSize = 16;

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const result = await withRetry(() =>
      ai.models.embedContent({
        model: EMBED_MODEL,
        contents: batch,
      })
    );
    const embeddings = result.embeddings || [];
    for (let j = 0; j < batch.length; j++) {
      vectors.push(embeddings[j]?.values || []);
    }
  }

  return vectors;
}

export async function transcribeAudioBuffer(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  return withRetry(async () => {
    const ai = getGeminiClient();
    const safeMime = mimeType || 'audio/webm';
    const response = await ai.models.generateContent({
      model: TRANSCRIBE_MODEL,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: safeMime,
              data: buffer.toString('base64'),
            },
          },
          {
            text: 'Provide an accurate, cleanly punctuated transcript of this spoken audio. If speakers change, indicate them naturally. Only output the transcript text.',
          },
        ],
      },
    });
    return (response.text || '').trim();
  });
}

export function formatAiError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('API_KEY_INVALID') || message.includes('PERMISSION_DENIED')) {
    return 'Gemini API authentication failed. Please check the API key configured in Settings > Secrets.';
  }
  if (message.includes('RESOURCE_EXHAUSTED') || message.includes('429')) {
    return 'AI service rate limit reached. Please wait a few seconds and try again.';
  }
  return message || 'An unexpected AI service error occurred.';
}
