/**
 * LLM Provider abstraction.
 * Core depends on this interface, never on specific providers.
 */

export interface CompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

export interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string; detail?: 'low' | 'high' | 'auto' };
}

export interface CompletionRequest {
  messages: CompletionMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: { type: 'json_object' | 'text' };
}

export interface CompletionResult {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
}

export interface ProviderCapabilities {
  supportsImages: boolean;
  supportsJsonMode: boolean;
  maxContextTokens: number;
  modelName: string;
}

export interface LLMProvider {
  /**
   * Run a text completion.
   */
  complete(request: CompletionRequest): Promise<CompletionResult>;

  /**
   * Analyze an image (optional capability).
   */
  analyzeImage?(request: CompletionRequest): Promise<CompletionResult>;

  /**
   * Report provider capabilities.
   */
  capabilities(): ProviderCapabilities;
}
