// EPIC-001: Platform Foundation & Deployment
// STORY-006: Configure CI/CD Pipeline with GitHub Integration
// TASK-006-004: Pipeline verification tests

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const CLOUDBUILD_PATH = path.resolve(__dirname, '../../../cloudbuild.yaml');

interface CloudBuildStep {
  id?: string;
  waitFor?: string[];
  args?: string[];
}

interface CloudBuildConfig {
  steps: CloudBuildStep[];
  images: string[];
  timeout: string;
}

describe('EPIC-001/STORY-006/TASK-006-004: cloudbuild.yaml pipeline contract', () => {
  let config: CloudBuildConfig;

  beforeAll(() => {
    const raw = fs.readFileSync(CLOUDBUILD_PATH, 'utf8');
    config = yaml.load(raw) as CloudBuildConfig;
  });

  it('parses as valid YAML with steps, images, and timeout', () => {
    expect(config).toBeDefined();
    expect(Array.isArray(config.steps)).toBe(true);
    expect(Array.isArray(config.images)).toBe(true);
    expect(config.timeout).toBeDefined();
  });

  it('contains all required step IDs', () => {
    const ids = config.steps.map((s) => s.id).filter(Boolean);
    const required = [
      'install-deps',
      'run-tests',
      'build-web',
      'build-migrator',
      'push-web',
      'push-migrator',
      'run-migrations',
      'deploy-web',
    ];
    for (const id of required) {
      expect(ids).toContain(id);
    }
  });

  it('sets timeout to 1200s', () => {
    expect(config.timeout).toBe('1200s');
  });

  it('images array contains all three expected images', () => {
    const images = config.images;
    expect(images.some((img) => img.includes('aaa-web:latest'))).toBe(true);
    expect(images.some((img) => img.includes('aaa-web:v1.0.0'))).toBe(true);
    expect(images.some((img) => img.includes('aaa-migrator:latest'))).toBe(true);
  });

  it('deploy-web waits for push-web and run-migrations', () => {
    const deployStep = config.steps.find((s) => s.id === 'deploy-web');
    expect(deployStep).toBeDefined();
    expect(deployStep!.waitFor).toContain('push-web');
    expect(deployStep!.waitFor).toContain('run-migrations');
  });
});
