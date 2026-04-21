// EPIC-003.1: Classification LLM Enrichment
// STORY-034: LLM Provider Interface and Prompt File Infrastructure
// TASK-034-001: LLMProvider abstract interface + companion types
// RFC-007: LLM Enrichment Provider Architecture

export interface LLMProviderConfig {
  apiKey: string;
  model: string;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface LLMResponse<T> {
  result: T;
  model: string;
  promptVersion: string;   // sha256(rawPromptContent).slice(0, 8) — stable for same template
  inputTokens: number;
  outputTokens: number;
}

export interface LLMProvider {
  readonly providerName: string;

  /**
   * Send a structured-output prompt and return a typed result.
   * @param promptContent  Raw template content (pre-interpolation); provider interpolates variables
   * @param variables      Template variables to substitute into promptContent
   * @param responseSchema JSON Schema describing the expected output shape; used as tool input_schema
   */
  structuredComplete<T>(
    promptContent: string,
    variables: Record<string, unknown>,
    responseSchema: object,
  ): Promise<LLMResponse<T>>;
}
