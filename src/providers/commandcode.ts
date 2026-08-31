import type {
  LLMProvider,
  CompletionRequest,
  CompletionResult,
  ProviderCapabilities,
} from './types.js';
import { Logger } from '../core/logger.js';

const log = new Logger({ prefix: 'CommandCode' });

export interface CommandCodeConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeout?: number;
  maxRetries?: number;
}

/**
 * CommandCode LLM provider using an OpenAI-compatible API.
 * No SDK dependency — uses fetch directly.
 */
export class CommandCodeProvider implements LLMProvider {
  private config: CommandCodeConfig;
  private requestCount = 0;
  private errorCount = 0;

  constructor(config: CommandCodeConfig) {
    this.config = {
      timeout: 60000,
      maxRetries: 2,
      ...config,
    };
  }

  static fromEnv(overrides?: Partial<CommandCodeConfig>): CommandCodeProvider | null {
    const apiKey =
      overrides?.apiKey ||
      process.env['COMMANDCODE_API_KEY'] ||
      process.env['FREEBUFF_API_KEY'] ||
      process.env['OPENAI_API_KEY'];

    if (!apiKey) {
      return null;
    }

    const isCommandCodeKey = apiKey.startsWith('user_') || Boolean(process.env['COMMANDCODE_API_KEY']);

    let baseUrl =
      overrides?.baseUrl ||
      process.env['COMMANDCODE_BASE_URL'] ||
      process.env['FREEBUFF_BASE_URL'] ||
      process.env['OPENAI_BASE_URL'] ||
      (isCommandCodeKey ? 'https://api.commandcode.ai/provider/v1' : 'https://api.openai.com/v1');

    // Auto-correct common typos like .com -> .ai/provider/v1
    if (baseUrl.includes('commandcode.com')) {
      baseUrl = 'https://api.commandcode.ai/provider/v1';
    } else if (baseUrl === 'https://api.commandcode.ai' || baseUrl === 'https://api.commandcode.ai/v1') {
      baseUrl = 'https://api.commandcode.ai/provider/v1';
    }

    let model =
      overrides?.model ||
      process.env['COMMANDCODE_MODEL'] ||
      process.env['FREEBUFF_MODEL'] ||
      process.env['OPENAI_MODEL'] ||
      (isCommandCodeKey ? 'MiniMaxAI/MiniMax-M3' : 'gpt-4o');

    // Auto-normalize friendly model aliases to Command Code API IDs
    if (model === 'minimax-m3-free' || model === 'minimax/minimax-m3-free' || model === 'minimax-m3') {
      model = 'MiniMaxAI/MiniMax-M3';
    } else if (model === 'mimo' || model === 'mimo-2.5' || model === 'mimo-v2.5' || model === 'xiaomi-mimo') {
      model = 'xiaomi/mimo-v2.5';
    }

    return new CommandCodeProvider({
      apiKey,
      baseUrl,
      model,
      timeout: overrides?.timeout,
      maxRetries: overrides?.maxRetries,
    });
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    return this.makeRequest(request);
  }

  async analyzeImage(request: CompletionRequest): Promise<CompletionResult> {
    return this.makeRequest(request);
  }

  capabilities(): ProviderCapabilities {
    return {
      supportsImages: true,
      supportsJsonMode: true,
      maxContextTokens: 128000,
      modelName: this.config.model,
    };
  }

  getStats(): { requests: number; errors: number } {
    return { requests: this.requestCount, errors: this.errorCount };
  }

  private async makeRequest(request: CompletionRequest): Promise<CompletionResult> {
    const url = `${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`;

    const body = {
      model: this.config.model,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: request.temperature ?? 0.3,
      max_tokens: request.maxTokens ?? 4096,
      ...(request.responseFormat ? { response_format: request.responseFormat } : {}),
    };

    let lastError: Error | null = null;

    this.requestCount++;

    for (let attempt = 0; attempt <= (this.config.maxRetries ?? 2); attempt++) {
      try {

        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          this.config.timeout ?? 60000
        );

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          throw new Error(`API error ${response.status}: ${errorText.slice(0, 200)}`);
        }

        const data = await response.json() as {
          choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
        };

        const choice = data.choices?.[0];
        if (!choice?.message?.content) {
          throw new Error('Empty response from API');
        }

        return {
          content: choice.message.content,
          usage: data.usage ? {
            promptTokens: data.usage.prompt_tokens ?? 0,
            completionTokens: data.usage.completion_tokens ?? 0,
            totalTokens: data.usage.total_tokens ?? 0,
          } : undefined,
          finishReason: choice.finish_reason ?? undefined,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        this.errorCount++;

        if (attempt < (this.config.maxRetries ?? 2)) {
          const delay = Math.pow(2, attempt) * 1000;
          log.warn(`Attempt ${attempt + 1} failed, retrying in ${delay}ms: ${lastError.message}`);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    throw lastError ?? new Error('Request failed');
  }
}
