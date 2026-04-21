// EPIC-003.1: Classification LLM Enrichment
// STORY-034: LLM Provider Interface and Prompt File Infrastructure
// TASK-034-003: PromptLoader — reads .md files, optional interpolation, version hash
// RFC-007: prompt file conventions — plain .md, {{variable}} syntax, sha256 version

import fs from 'fs';
import crypto from 'crypto';

export interface LoadedPrompt {
  content: string;   // interpolated if variables provided; raw otherwise
  version: string;   // sha256(rawFileContent).slice(0, 8) — always from pre-interpolation content
}

export class PromptLoader {
  load(promptPath: string, variables?: Record<string, unknown>): LoadedPrompt {
    const raw = fs.readFileSync(promptPath, 'utf-8');
    const version = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 8);

    if (!variables || Object.keys(variables).length === 0) {
      return { content: raw, version };
    }

    const content = raw.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
      if (variables[key] === undefined) {
        throw new Error(`PromptLoader: missing variable "${key}"`);
      }
      return String(variables[key]);
    });

    return { content, version };
  }
}
