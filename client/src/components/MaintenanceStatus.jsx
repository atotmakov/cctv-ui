import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getMaintenanceStatus } from '../api/client.js';
import './MaintenanceStatus.css';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function formatAgo(iso) {
  if (!iso) return null;
  const diffMs = Math.max(0, Date.now() - new Date(iso).getTime());
  if (diffMs < MINUTE) return 'just now';
  if (diffMs < HOUR) return `${Math.floor(diffMs / MINUTE)}m ago`;
  if (diffMs < DAY) return `${Math.floor(diffMs / HOUR)}h ago`;
  return `${Math.floor(diffMs / DAY)}d ago`;
}

export default function MaintenanceStatus() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getMaintenanceStatus()
      .then(setStatus)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="maint-page"><div className="maint-state">Loading maintenance status…</div></div>;
  if (error)   return <div className="maint-page"><div className="maint-state" style={{ color: 'var(--danger)' }}>Error: {error}</div></div>;

  const { configuredRetentionDays, lastRun, cameras } = status;
  const cameraById = new Map((lastRun?.cameras ?? []).map(c => [c.id, c]));

  return (
    <div className="maint-page">
      <header className="maint-header">
        <h1>Maintenance Status</h1>
        <Link to="/" className="btn-view">Back to cameras</Link>
      </header>

      <section className="maint-summary">
        <div className="maint-stat">
          <span className="maint-stat-label">Retention</span>
          <span className="maint-stat-value">{configuredRetentionDays > 0 ? `${configuredRetentionDays} days` : 'not configured'}</span>
        </div>
        <div className="maint-stat">
          <span className="maint-stat-label">Last run</span>
          <span className="maint-stat-value" title={lastRun?.lastRunAt ?? ''}>
            {lastRun ? formatAgo(lastRun.lastRunAt) : 'never'}
          </span>
        </div>
        <div className="maint-stat">
          <span className="maint-stat-label">Cameras managed</span>
          <span className="maint-stat-value">{lastRun ? `${lastRun.camerasManaged}/${lastRun.camerasTotal}` : '—'}</span>
        </div>
        <div className="maint-stat">
          <span className="maint-stat-label">Last run removed / wrote</span>
          <span className="maint-stat-value">
            {lastRun ? `${lastRun.totalDateFoldersRemoved} folder(s) / ${lastRun.totalIndexRowsWritten} row(s)` : '—'}
          </span>
        </div>
      </section>

      <table className="maint-table">
        <thead>
          <tr>
            <th>Camera</th>
            <th>Status</th>
            <th>Active DB file</th>
            <th>Date folders</th>
            <th>Range</th>
            <th>Last run</th>
          </tr>
        </thead>
        <tbody>
          {cameras.map(cam => {
            const runInfo = cameraById.get(cam.id);
            return (
              <tr key={cam.id}>
                <td>{cam.id}</td>
                <td>
                  <span className={`maint-badge ${cam.managed ? 'managed' : 'unmanaged'}`}>
                    {cam.managed ? 'managed' : 'unmanaged'}
                  </span>
                </td>
                <td>{cam.activeDbFile ?? '—'}</td>
                <td>{cam.dateFolderCount}</td>
                <td>{cam.oldestDate && cam.newestDate ? `${cam.oldestDate} → ${cam.newestDate}` : '—'}</td>
                <td>
                  {runInfo
                    ? (runInfo.error
                        ? <span className="maint-badge error" title={runInfo.error}>error</span>
                        : `−${runInfo.dateFoldersRemoved} / +${runInfo.indexRowsWritten}`)
                    : (cam.managed ? 'not yet run' : '—')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
