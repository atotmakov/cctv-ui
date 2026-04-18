import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Point the server at the committed fixture data.
// Must be set before config.js is imported anywhere — vitest setupFiles
// run in the worker process before test files load their modules.
process.env.STORAGE_TYPE = 'local';
process.env.STORAGE_PATH = path.resolve(__dirname, '..', '..', 'video_example');
