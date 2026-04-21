// EPIC-003.1: Classification LLM Enrichment
// STORY-034: LLM Provider Interface and Prompt File Infrastructure
// TASK-034-002: ClaudeProvider — Anthropic Messages API, tool-use structured output
// RFC-007: LLM Enrichment Provider Architecture
// Env vars: ANTHROPIC_API_KEY, LLM_MODEL (fallback: claude-sonnet-4-6), LLM_ENRICHMENT_MAX_TOKENS

import crypto from 'crypto';
import type { LLMProvider, LLMProviderConfig, LLMResponse } from '../ports/llm-provider.interface';

function interpolate(template: string, variables: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    if (variables[key] === undefined) {
      throw new Error(`ClaudeProvider: missing template variable "${key}"`);
    }
    return String(variables[key]);
  });
}

function sha256Hex(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

interface AnthropicContentBlock {
  type: string;
  name?: string;
  input?: unknown;
}

interface AnthropicResponse {
  model: string;
  content: AnthropicContentBlock[];
  usage: { input_tokens: number; output_tokens: number };
}

export class ClaudeProvider implements LLMProvider {
  readonly providerName = 'claude';

  constructor(private readonly config: LLMProviderConfig) {}

  static fromEnv(): ClaudeProvider {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ClaudeProvider: ANTHROPIC_API_KEY environment variable is required');
    }
    const model = process.env.LLM_MODEL ?? 'claude-sonnet-4-6';
    const maxTokens = process.env.LLM_ENRICHMENT_MAX_TOKENS
      ? parseInt(process.env.LLM_ENRICHMENT_MAX_TOKENS, 10)
      : 1024;
    return new ClaudeProvider({ apiKey, model, maxTokens });
  }

  async structuredComplete<T>(
    promptContent: string,
    variables: Record<string, unknown>,
    responseSchema: object,
  ): Promise<LLMResponse<T>> {
    const promptVersion = sha256Hex(promptContent).slice(0, 8);
    const interpolated = interpolate(promptContent, variables);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: this.config.maxTokens ?? 1024,
        tools: [{ name: 'output', input_schema: responseSchema }],
        tool_choice: { type: 'tool', name: 'output' },
        messages: [{ role: 'user', content: interpolated }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    const body = await response.json() as AnthropicResponse;

    const toolBlock = body.content.find(
      (block) => block.type === 'tool_use' && block.name === 'output',
    );
    if (!toolBlock) {
      throw new Error('Claude response: no tool_use block found');
    }

    return {
      result: toolBlock.input as T,
      model: body.model,
      promptVersion,
      inputTokens: body.usage.input_tokens,
      outputTokens: body.usage.output_tokens,
    };
  }
}
