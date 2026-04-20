# TASK-014-001 — Install UI Testing Dependencies

## Parent Story
STORY-014 — Sign-In Page UI (Screen 1)

## Epic
EPIC-002 — Authentication & User Management

## Objective
Install React Testing Library and jsdom so that the client-side `SignInForm` component can be unit tested in Jest. This is the first UI component in the project — testing infrastructure for components does not yet exist.

## Traceability
- STORY-014: first UI story; unit tests for React components require jsdom + React Testing Library

## Packages to Install
```bash
npm install --save-dev @testing-library/react @testing-library/jest-dom @testing-library/user-event jest-environment-jsdom
```

| Package | Purpose |
|---------|---------|
| `@testing-library/react` | `render()`, `screen`, `fireEvent` etc. |
| `@testing-library/jest-dom` | Custom matchers: `toBeInTheDocument()`, `toBeDisabled()`, etc. |
| `@testing-library/user-event` | Simulates real user interactions (type, click) |
| `jest-environment-jsdom` | DOM environment for Jest (needed for React component rendering) |

## Jest Setup File
Create `tests/jest.setup.ts`:
```typescript
// Provides @testing-library/jest-dom matchers (toBeInTheDocument, toBeDisabled, etc.)
import '@testing-library/jest-dom';
```

## jest.config.ts Updates
Add `setupFilesAfterEnv` for the setup file:
```typescript
setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.ts'],
```

**Per-file jsdom**: Component test files use the docblock annotation to switch to jsdom:
```
/** @jest-environment jsdom */
```
This avoids changing the global `testEnvironment: 'node'` (which must stay for DB-touching tests).

## Acceptance Criteria
- [ ] All packages installed (package.json updated, package-lock.json updated)
- [ ] `tests/jest.setup.ts` created with `import '@testing-library/jest-dom'`
- [ ] `jest.config.ts` updated with `setupFilesAfterFramework`
- [ ] Existing 219 tests still pass after config change

## Definition of Done
- [ ] npm packages installed
- [ ] Jest setup file created
- [ ] `jest.config.ts` updated
- [ ] Full test suite still passes (no regressions from config change)

---

**END TASK-014-001**
