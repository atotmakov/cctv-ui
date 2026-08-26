import { Router } from 'express';
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
      // Sourced from the maintenance job's own status file, not this
      // process's env — RETENTION_DAYS is only ever set on the
      // cctv-maintenance service/container, not on this (cctv-ui) one.
      configuredRetentionDays: lastRun?.retentionDays ?? null,
      lastRun,
      cameras,
    });
  } catch (err) {
    console.error('[maintenance] status:', err);
    res.status(500).json({ error: 'Failed to get maintenance status' });
  }
});

export default router;
