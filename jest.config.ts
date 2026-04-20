// EPIC-001: Platform Foundation & Deployment
// STORY-004: Implement Prisma Schema and Database Migrations
// TASK-004-001: Configure Jest with ts-jest for TypeScript tests
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/tests/**/*.test.ts', '<rootDir>/tests/**/*.test.tsx'],
  testPathIgnorePatterns: ['/node_modules/', '/.next/'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: { module: 'commonjs', jsx: 'react-jsx' },
    }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testTimeout: 30000,
  verbose: true,
  // Integration tests share a single test DB; serial execution prevents race conditions
  maxWorkers: 1,
  // Provides @testing-library/jest-dom matchers for component tests
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.ts'],
};

export default config;
