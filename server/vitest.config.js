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
    // Test files share tests/fixtures as the storage root and create temp
    // camera folders in it; run them one at a time so one file's temp
    // cameras (and their open SQLite handles, which lock files on Windows)
    // never leak into another's camera listing or cleanup.
    fileParallelism: false,
    // Sets STORAGE_PATH before any project module is imported.
    setupFiles: ['./tests/setup.js'],
    environment: 'node',
  },
});
