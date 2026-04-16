import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '.env') });

const rawStoragePath = process.env.STORAGE_PATH || './video_example';

// UNC paths (\\host\share) are already absolute on Windows; don't resolve them
function resolveStoragePath(p) {
  if (p.startsWith('\\\\') || p.startsWith('//')) return p;
  if (path.isAbsolute(p)) return p;
  return path.resolve(__dirname, '..', p);
}

export default {
  port: parseInt(process.env.PORT || '3000', 10),
  storageType: process.env.STORAGE_TYPE || 'local',
  storagePath: resolveStoragePath(rawStoragePath),
  smb: {
    host: process.env.SMB_HOST,
    share: process.env.SMB_SHARE,
    username: process.env.SMB_USERNAME,
    password: process.env.SMB_PASSWORD,
  },
};
