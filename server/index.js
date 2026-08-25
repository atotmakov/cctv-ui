import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';
import { authenticateSmb } from './services/smbAuth.js';
import camerasRouter from './routes/cameras.js';
import videoRouter from './routes/video.js';
import versionRouter from './routes/version.js';
import maintenanceRouter from './routes/maintenance.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

authenticateSmb();

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/cameras', camerasRouter);
app.use('/api/video', videoRouter);
app.use('/api/version', versionRouter);
app.use('/api/maintenance', maintenanceRouter);

app.get('/health', (_req, res) => res.json({ ok: true }));

// ── Serve built React app in production ───────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

app.listen(config.port, () => {
  console.log(`[server] http://localhost:${config.port}`);
  console.log(`[server] storage: ${config.storageType} @ ${config.storagePath}`);
});
