import { execSync } from 'child_process';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';
import camerasRouter from './routes/cameras.js';
import videoRouter from './routes/video.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── SMB authentication (Windows only) ────────────────────────────────────────
// Authenticates the Node process against the SMB share so all subsequent
// fs calls using the UNC path work without a password prompt.
if (config.storageType === 'smb' && config.smb.host) {
  const unc = `\\\\${config.smb.host}\\${config.smb.share}`;
  try {
    // Delete any stale credential first (ignore errors if none exists)
    execSync(`net use "${unc}" /delete /y`, { stdio: 'ignore' });
  } catch { /* no existing mapping — that's fine */ }

  try {
    execSync(
      `net use "${unc}" /user:${config.smb.username} ${config.smb.password}`,
      { stdio: 'pipe' }
    );
    console.log(`[server] SMB authenticated: ${unc}`);
  } catch (err) {
    console.error(`[server] SMB authentication failed: ${err.stderr?.toString().trim() ?? err.message}`);
    console.error('[server] Check SMB_HOST / SMB_USERNAME / SMB_PASSWORD in .env');
  }
}

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/cameras', camerasRouter);
app.use('/api/video', videoRouter);

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
