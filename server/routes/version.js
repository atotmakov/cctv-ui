import { Router } from 'express';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Root package.json is the single source of truth for the app version.
const { version } = JSON.parse(
  readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf-8')
);

const router = Router();

// GET /api/version
router.get('/', (_req, res) => res.json({ version }));

export default router;
