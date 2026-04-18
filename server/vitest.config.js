import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // node:sqlite requires --experimental-sqlite; forks pool lets us pass
    // execArgv to the worker process (threads pool does not).
    pool: 'forks',
    poolOptions: {
      forks: {
        execArgv: ['--experimental-sqlite'],
      },
    },
    // Sets STORAGE_PATH before any project module is imported.
    setupFiles: ['./tests/setup.js'],
    environment: 'node',
  },
});
