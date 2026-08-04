import { execSync } from 'child_process';
import config from '../config.js';

/**
 * Authenticates the current process against the SMB share so all subsequent
 * fs calls using the UNC path work without a password prompt. Windows only.
 * No-op when storageType isn't 'smb' or no host is configured.
 */
export function authenticateSmb() {
  if (config.storageType !== 'smb' || !config.smb.host) return;

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
    console.log(`[smbAuth] SMB authenticated: ${unc}`);
  } catch (err) {
    console.error(`[smbAuth] SMB authentication failed: ${err.stderr?.toString().trim() ?? err.message}`);
    console.error('[smbAuth] Check SMB_HOST / SMB_USERNAME / SMB_PASSWORD in .env');
  }
}
