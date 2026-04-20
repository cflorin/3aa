// EPIC-001: Platform Foundation & Deployment
// STORY-004: Implement Prisma Schema and Database Migrations
// TASK-004-001: Configure Jest with ts-jest for TypeScript tests
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/.next/'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: { module: 'commonjs' },
    }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testTimeout: 30000,
  verbose: true,
};

export default config;
