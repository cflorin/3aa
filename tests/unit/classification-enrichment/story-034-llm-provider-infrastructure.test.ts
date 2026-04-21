// EPIC-003.1: Classification LLM Enrichment
// STORY-034: LLM Provider Interface and Prompt File Infrastructure
// TASK-034-006: Unit tests — PromptLoader (4) + ClaudeProvider (3)
//
// All fixtures: synthetic (no live API calls, no live disk reads)

import path from 'path';

// ─── Module mocks (must be at top level for jest hoisting) ────────────────────

jest.mock('fs');

import fs from 'fs';

// ─── PromptLoader ─────────────────────────────────────────────────────────────

describe('EPIC-003.1/STORY-034: PromptLoader', () => {
  let PromptLoader: typeof import('../../../src/modules/classification-enrichment/utils/prompt-loader').PromptLoader;

  beforeAll(() => {
    ({ PromptLoader } = jest.requireActual(
      '../../../src/modules/classification-enrichment/utils/prompt-loader',
    ));
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads file content and returns it unchanged when no variables provided', () => {
    (fs.readFileSync as jest.Mock).mockReturnValue('Hello world');

    const loader = new PromptLoader();
    const result = loader.load('/fake/prompt.md');

    expect(result.content).toBe('Hello world');
    expect(fs.readFileSync).toHaveBeenCalledWith('/fake/prompt.md', 'utf-8');
  });

  it('interpolates {{variables}} correctly', () => {
    (fs.readFileSync as jest.Mock).mockReturnValue('Company: {{company_name}}, Sector: {{sector}}');

    const loader = new PromptLoader();
    const result = loader.load('/fake/prompt.md', { company_name: 'Apple', sector: 'Technology' });

    expect(result.content).toBe('Company: Apple, Sector: Technology');
  });

  it('throws on missing variable with variable name in error message', () => {
    (fs.readFileSync as jest.Mock).mockReturnValue('Company: {{company_name}} Revenue: {{revenue}}');

    const loader = new PromptLoader();
    expect(() =>
      loader.load('/fake/prompt.md', { company_name: 'Apple' }) // revenue missing
    ).toThrow('revenue');
  });

  it('version hash changes when file content changes', () => {
    const loader = new PromptLoader();

    (fs.readFileSync as jest.Mock).mockReturnValue('Content version A');
    const { version: v1 } = loader.load('/fake/prompt.md');

    (fs.readFileSync as jest.Mock).mockReturnValue('Content version B');
    const { version: v2 } = loader.load('/fake/prompt.md');

    expect(v1).not.toBe(v2);
    expect(v1).toHaveLength(8);
    expect(v2).toHaveLength(8);
  });
});

// ─── ClaudeProvider ───────────────────────────────────────────────────────────

describe('EPIC-003.1/STORY-034: ClaudeProvider', () => {
  let ClaudeProvider: typeof import('../../../src/modules/classification-enrichment/providers/claude.provider').ClaudeProvider;
  let mockFetch: jest.SpyInstance;

  const TEST_CONFIG = { apiKey: 'test-key', model: 'claude-test', maxTokens: 512 };

  const RESPONSE_SCHEMA = {
    type: 'object',
    properties: {
      flag_value: { type: 'boolean' },
      confidence: { type: 'number' },
    },
    required: ['flag_value', 'confidence'],
  };

  beforeAll(() => {
    ({ ClaudeProvider } = jest.requireActual(
      '../../../src/modules/classification-enrichment/providers/claude.provider',
    ));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch = jest.spyOn(global, 'fetch' as keyof typeof global);
  });

  afterEach(() => {
    mockFetch.mockRestore();
  });

  it('parses tool_use block and returns typed result with metadata', async () => {
    const mockBody = {
      model: 'claude-test',
      content: [
        { type: 'tool_use', name: 'output', input: { flag_value: true, confidence: 0.9 } },
      ],
      usage: { input_tokens: 150, output_tokens: 40 },
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockBody,
    });

    const provider = new ClaudeProvider(TEST_CONFIG);
    const result = await provider.structuredComplete<{ flag_value: boolean; confidence: number }>(
      'Classify {{company}}',
      { company: 'Apple' },
      RESPONSE_SCHEMA,
    );

    expect(result.result).toEqual({ flag_value: true, confidence: 0.9 });
    expect(result.model).toBe('claude-test');
    expect(result.promptVersion).toHaveLength(8);
    expect(result.inputTokens).toBe(150);
    expect(result.outputTokens).toBe(40);

    // Verify request shape
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'output' });
    expect(body.tools[0].name).toBe('output');
    expect(body.messages[0].content).toBe('Classify Apple'); // variables interpolated
  });

  it('throws with HTTP status on 5xx response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const provider = new ClaudeProvider(TEST_CONFIG);
    await expect(
      provider.structuredComplete('prompt', {}, RESPONSE_SCHEMA),
    ).rejects.toThrow('500');
  });

  it('throws when response contains no tool_use block', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'claude-test',
        content: [{ type: 'text', text: 'Sorry, I cannot answer.' }],
        usage: { input_tokens: 50, output_tokens: 10 },
      }),
    });

    const provider = new ClaudeProvider(TEST_CONFIG);
    await expect(
      provider.structuredComplete('prompt', {}, RESPONSE_SCHEMA),
    ).rejects.toThrow('tool_use');
  });
});
