# STORY-034 — LLM Provider Interface and Prompt File Infrastructure

## Epic
EPIC-003.1 — Classification LLM Enrichment

## Status
done ✅ (2026-04-21, unit_verified — 7/7 tests passing)

## Purpose
Before any LLM-based enrichment can be implemented, the abstract provider interface and prompt file loading infrastructure must exist. This story establishes the swappable `LLMProvider` interface (RFC-007), the concrete `ClaudeProvider`, and a minimal `PromptLoader` — so that STORY-035–040 implement enrichment logic without infrastructure concerns.

Key design decisions from RFC-007:
- Abstract interface: API key/provider swappable without touching enrichment logic
- Prompt files: plain `.md` — reviewable and editable without code changes
- No YAML frontmatter: output schema lives in TypeScript next to the detector
- Provider does interpolation: `promptContent` is the raw template; `variables` are passed to `structuredComplete`; `promptVersion = sha256(rawTemplate).slice(0, 8)` — stable across calls for the same template

## Story
As a **developer**,
I want **an abstract `LLMProvider` interface with a concrete `ClaudeProvider`, plus a `PromptLoader` that reads plain-text `.md` prompt files** —
so that **all enrichment jobs call `provider.structuredComplete()` without vendor coupling, and prompts can be edited as plain text without code changes**.

## Outcome
- `LLMProvider` interface: `structuredComplete<T>(promptContent, variables, responseSchema)` (RFC-007)
- `ClaudeProvider`: Anthropic Messages API, tool-use pattern, `ANTHROPIC_API_KEY` env var
- `PromptLoader`: reads `.md` file, optionally interpolates `{{variable}}` placeholders, computes version hash from raw file content (pre-interpolation)
- Four prompt file stubs created for STORY-035–040 to fill in
- `.env.example` updated with `ANTHROPIC_API_KEY`, `LLM_MODEL`, `LLM_ENRICHMENT_CONFIDENCE_THRESHOLD`

## Module Structure
```
src/modules/classification-enrichment/
  ports/
    llm-provider.interface.ts     ← LLMProviderConfig, LLMResponse<T>, LLMProvider
  providers/
    claude.provider.ts            ← ClaudeProvider implements LLMProvider
  utils/
    prompt-loader.ts              ← reads .md, optionally interpolates {{vars}}, version hash
  prompts/
    combined-enrichment.md        ← stub (STORY-038/040 writes body)
    holding-company-flag.md       ← stub (STORY-035)
    cyclicality-flag.md           ← stub (STORY-036)
    binary-flag.md                ← stub (STORY-037)
```

## Interpolation flow (canonical for EPIC-003.1)
```
PromptLoader.load(path)           → { content: rawTemplate, version: sha256(raw).slice(0,8) }
provider.structuredComplete(      → interpolates variables internally; promptVersion = version
  rawTemplate, variables, schema)
```

`PromptLoader.load(path, variables)` with explicit variables also interpolates at load time (useful for testing and single-flag admin use). Version is always based on raw content regardless of which path is used.

## Dependencies
- None within EPIC-003.1
- Node.js `crypto` module (built-in)
- No new npm packages required

---

## BDD Scenarios

### Scenario A — PromptLoader: interpolation
```
Given a prompt file with "Company: {{company_name}}"
When PromptLoader.load(path, { company_name: "Apple" }) is called
Then content = "Company: Apple"
And version = sha256(rawFileContent).slice(0, 8)
```

### Scenario B — PromptLoader: throws on missing variable
```
Given a prompt file with "{{missing_var}}"
When PromptLoader.load(path, {}) is called (missing_var not provided)
Then throws an error naming the missing variable
```

### Scenario C — PromptLoader: version stability
```
Given the same file content loaded twice with different variables
Then both loads return the same version string
Given the file content changes
Then the version string changes
```

### Scenario D — ClaudeProvider: successful structured output
```
Given fetch returns a 200 response with a tool_use block containing { flag_value: true, confidence: 0.9 }
When provider.structuredComplete is called
Then result = { flag_value: true, confidence: 0.9 }
And model, promptVersion, inputTokens, outputTokens are set
```

### Scenario E — ClaudeProvider: API error propagated
```
Given fetch returns a 500 response
When provider.structuredComplete is called
Then an error is thrown with the HTTP status
```

### Scenario F — ClaudeProvider: missing tool_use block
```
Given fetch returns 200 but content has no tool_use block
When provider.structuredComplete is called
Then an error is thrown indicating parse failure
```

---

## Test Plan

| Test | What it proves | Pass criteria |
|------|---------------|---------------|
| PromptLoader: reads file and returns content | basic file read | content matches file |
| PromptLoader: interpolates {{variables}} correctly | template substitution | {{company}} → "Apple" |
| PromptLoader: throws on missing variable | fail-fast on template errors | Error thrown naming var |
| PromptLoader: version changes when content changes | hash correctness | v1 ≠ v2 after file change |
| ClaudeProvider: parses tool_use block → typed result | core output path | result matches tool input |
| ClaudeProvider: throws on 5xx response | HTTP error propagation | Error thrown |
| ClaudeProvider: throws when no tool_use block | parse error propagation | Error thrown |

Total: 7 tests

---

## Tasks

### TASK-034-001 — `LLMProvider` interface and types
**File:** `src/modules/classification-enrichment/ports/llm-provider.interface.ts` (new file, new directory)
**Status:** ready

```typescript
// EPIC-003.1: Classification LLM Enrichment
// STORY-034: LLM Provider Interface
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
  promptVersion: string;   // sha256(rawPromptContent).slice(0, 8)
  inputTokens: number;
  outputTokens: number;
}

export interface LLMProvider {
  readonly providerName: string;
  structuredComplete<T>(
    promptContent: string,              // raw template content (pre-interpolation)
    variables: Record<string, unknown>, // template variables; interpolated by provider
    responseSchema: object,             // JSON Schema; defined by the calling detector
  ): Promise<LLMResponse<T>>;
}
```

---

### TASK-034-002 — `ClaudeProvider`
**File:** `src/modules/classification-enrichment/providers/claude.provider.ts` (new file, new directory)
**Status:** ready | **Depends on:** TASK-034-001

**Implementation notes:**
- `ClaudeProvider.fromEnv()` static factory: reads `process.env.ANTHROPIC_API_KEY` (throws if absent/empty), `process.env.LLM_MODEL` (fallback: `claude-sonnet-4-6`), `process.env.LLM_ENRICHMENT_MAX_TOKENS` (fallback: `1024`)
- `structuredComplete<T>`:
  1. Interpolate: scan `promptContent` for `{{var}}` patterns, replace with `variables` values, throw on missing variable
  2. Compute `promptVersion = sha256(promptContent).slice(0, 8)` (hash of raw template, before interpolation)
  3. POST to `https://api.anthropic.com/v1/messages` with:
     ```json
     {
       "model": "...",
       "max_tokens": 1024,
       "tools": [{ "name": "output", "input_schema": responseSchema }],
       "tool_choice": { "type": "tool", "name": "output" },
       "messages": [{ "role": "user", "content": interpolatedContent }]
     }
     ```
  4. If response not ok: throw `Error(\`Claude API error: \${status}\`)`
  5. Find content item where `type === 'tool_use'` and `name === 'output'`; if not found, throw `Error('Claude response: no tool_use block')`
  6. Return `{ result: item.input as T, model: responseBody.model, promptVersion, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens }`

**No retry logic in ClaudeProvider** — retry/backoff is the responsibility of the calling sync job (STORY-038).

---

### TASK-034-003 — `PromptLoader`
**File:** `src/modules/classification-enrichment/utils/prompt-loader.ts` (new file, new directory)
**Status:** ready | **Depends on:** none

**Implementation notes:**
- Uses `fs.readFileSync(promptPath, 'utf-8')` — sync, no caching, lazy read at call time
- Version hash: `crypto.createHash('sha256').update(rawContent).digest('hex').slice(0, 8)` — always from raw pre-interpolation content
- Interpolation (when `variables` provided):
  - Find all `{{varName}}` patterns in rawContent
  - For each, if `variables[varName] === undefined`, throw `Error(\`PromptLoader: missing variable "{{varName}}"\`)`
  - Replace all occurrences with `String(variables[varName])`
- `variables` is optional; if omitted, `content` returns raw file content unchanged
- Does NOT resolve relative paths — caller must pass absolute path or resolve before calling

**Interface:**
```typescript
export interface LoadedPrompt {
  content: string;   // interpolated if variables provided; raw otherwise
  version: string;   // sha256(rawFileContent).slice(0, 8)
}

export class PromptLoader {
  load(promptPath: string, variables?: Record<string, unknown>): LoadedPrompt
}
```

---

### TASK-034-004 — Prompt file stubs
**Files:** four new `.md` files in `src/modules/classification-enrichment/prompts/`
**Status:** ready | **Depends on:** none (can be created in parallel with TASK-034-001)

Each stub contains the minimum content for tests to load it and verify the version hash:

**`combined-enrichment.md`:**
```markdown
# combined-enrichment — TODO: implement in STORY-038/STORY-040
```

**`holding-company-flag.md`:**
```markdown
# holding-company-flag — TODO: implement in STORY-035
```

**`cyclicality-flag.md`:**
```markdown
# cyclicality-flag — TODO: implement in STORY-036
```

**`binary-flag.md`:**
```markdown
# binary-flag — TODO: implement in STORY-037
```

---

### TASK-034-005 — `.env.example` update
**File:** `.env.example` (modify)
**Status:** ready | **Depends on:** none

Append to existing `.env.example`:
```
# LLM Enrichment (EPIC-003.1 — classification flag and qualitative score enrichment)
ANTHROPIC_API_KEY="sk-ant-..."
LLM_MODEL="claude-sonnet-4-6"
LLM_ENRICHMENT_CONFIDENCE_THRESHOLD="0.60"
```

---

### TASK-034-006 — Unit tests
**File:** `tests/unit/classification-enrichment/story-034-llm-provider-infrastructure.test.ts` (new file, new directory)
**Status:** ready | **Depends on:** TASK-034-001 through TASK-034-004

**Mock structure:**
```typescript
// fs mocked for PromptLoader tests (avoids real disk reads for version-change test)
jest.mock('fs');
import fs from 'fs';

// fetch mocked globally for ClaudeProvider tests
// jest.spyOn(global, 'fetch') in beforeEach
```

**PromptLoader tests (4):**
- Mock `fs.readFileSync` to return controlled content
- Test file read, interpolation, missing-variable throw, version hash change

**ClaudeProvider tests (3):**
- Mock `global.fetch`
- Test successful tool_use parse, 5xx throw, missing tool_use throw

**Test file must NOT import `ANTHROPIC_API_KEY` from env** — ClaudeProvider constructed with explicit `{ apiKey: 'test-key', model: 'claude-test' }` config in tests.

**Total: 7 tests**

---

## Acceptance Criteria
- [ ] `LLMProvider` interface matches RFC-007 specification
- [ ] `ClaudeProvider` uses tool-use pattern; output schema is the caller-supplied `responseSchema`
- [ ] `PromptLoader` throws on missing template variable (not silent substitution)
- [ ] Version hash changes when prompt file content changes
- [ ] API key and model configurable via env vars (`ANTHROPIC_API_KEY`, `LLM_MODEL`)
- [ ] `.env.example` updated
- [ ] 7/7 unit tests passing
- [ ] No new TypeScript errors introduced
- [ ] Implementation log updated, story status → done
