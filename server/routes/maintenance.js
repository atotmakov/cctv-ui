import { Router } from 'express';
import config from '../config.js';
import { readMaintenanceRunStatus, getCameraStatuses } from '../services/maintenanceStatusService.js';

const router = Router();

// GET /api/maintenance/status
// Read-only — this route only ever reads state the maintenance job already
// wrote; it cannot trigger or affect a run (see CLAUDE.md "Maintenance
// Service" for why there's deliberately no trigger endpoint).
router.get('/status', async (_req, res) => {
  try {
    const [lastRun, cameras] = await Promise.all([
      readMaintenanceRunStatus(),
      getCameraStatuses(),
    ]);
    res.json({
      configuredRetentionDays: config.retentionDays,
      lastRun,
      cameras,
    });
  } catch (err) {
    console.error('[maintenance] status:', err);
    res.status(500).json({ error: 'Failed to get maintenance status' });
  }
});

export default router;
