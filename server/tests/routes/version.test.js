import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import versionRouter from '../../routes/version.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootPkg = JSON.parse(
  readFileSync(path.join(__dirname, '..', '..', '..', 'package.json'), 'utf-8')
);

const app = express();
app.use('/api/version', versionRouter);

// ── UC-4: GET /api/version ───────────────────────────────────────────────────
describe('GET /api/version (UC-4)', () => {
  it('returns 200 with the version from root package.json', async () => {
    const res = await request(app).get('/api/version');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ version: rootPkg.version });
  });
});
