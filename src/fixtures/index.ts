import { mergeTests } from '@playwright/test';
import { test as githubTest } from './github.fixture';
import { test as projectTest } from './github-project.fixture';

export const test = mergeTests(githubTest, projectTest);
