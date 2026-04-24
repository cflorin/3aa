// EPIC-002: Authentication & User Management
// STORY-014: Sign-In Page UI (Screen 1)
// TASK-014-001: Jest setup — provides @testing-library/jest-dom custom matchers
// STORY-056: Added TextDecoder/TextEncoder globals for jsdom environment
//   (jsdom does not inherit these from Node.js; they're standard Web APIs used by streaming components)

import '@testing-library/jest-dom';
import { TextDecoder, TextEncoder } from 'util';
Object.assign(global, { TextDecoder, TextEncoder });
