import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../api/client.js', () => ({
  getMaintenanceStatus: vi.fn(),
}));

import { getMaintenanceStatus } from '../api/client.js';
import MaintenanceStatus from './MaintenanceStatus.jsx';

function camera(id, health) {
  return {
    id,
    managed: false,
    activeDbFile: 'index.db',
    dateFolderCount: 3,
    oldestDate: '20261018',
    newestDate: '20261020',
    heartbeat: null,
    health,
  };
}

function health(level, reasons = []) {
  return { level, reasons, evaluatedAt: '2026-10-20T11:00:00.000Z', figures: {} };
}

async function renderWith(cameras) {
  getMaintenanceStatus.mockResolvedValue({ configuredRetentionDays: 33, lastRun: null, cameras });
  render(<MemoryRouter><MaintenanceStatus /></MemoryRouter>);
  await screen.findByRole('table');
}

function rowFor(id) {
  return screen.getByText(id).closest('tr');
}

beforeEach(() => vi.clearAllMocks());

describe('MaintenanceStatus — Health column', () => {
  it('adds a Health column right after Camera and keeps the Status column', async () => {
    await renderWith([camera('cam-ok', health('ok'))]);
    const headers = screen.getAllByRole('columnheader').map(th => th.textContent);
    expect(headers.slice(0, 3)).toEqual(['Camera', 'Health', 'Status']);
  });

  it('renders one label per camera with the level as text', async () => {
    await renderWith([
      camera('cam-ok', health('ok')),
      camera('cam-warn', health('warn', ['15 recordings today; usually ~40 by 14:00'])),
      camera('cam-critical', health('critical', ['No recordings for 31h; normally never more than 4h apart'])),
      camera('cam-unknown', health('unknown', ['learning (3 of 7 days)'])),
    ]);
    for (const level of ['ok', 'warn', 'critical', 'unknown']) {
      const label = within(rowFor(`cam-${level}`)).getByText(level, { selector: '.maint-badge.health' });
      expect(label).toHaveClass(level);
    }
  });

  it('puts the reasons in the tooltip and makes the label focusable with an aria-label', async () => {
    const reasons = ['No recordings for 2d 9h; normally never more than 4h apart', '0 recordings today; usually ~38 by 14:00'];
    await renderWith([camera('cam-critical', health('critical', reasons))]);
    const label = within(rowFor('cam-critical')).getByText('critical', { selector: '.maint-badge.health' });
    expect(label).toHaveAttribute('title', reasons.join('\n'));
    expect(label).toHaveAttribute('tabindex', '0');
    expect(label.getAttribute('aria-label')).toContain('critical');
    expect(label.getAttribute('aria-label')).toContain(reasons[0]);
    expect(label.getAttribute('aria-label')).toContain(reasons[1]);
  });

  it('renders health: null (evaluation failed) as unknown', async () => {
    await renderWith([camera('cam-null', null)]);
    const label = within(rowFor('cam-null')).getByText('unknown', { selector: '.maint-badge.health' });
    expect(label).toHaveClass('unknown');
  });

  it('still shows the managed/unmanaged Status badge', async () => {
    await renderWith([camera('cam-ok', health('ok'))]);
    expect(within(rowFor('cam-ok')).getByText('unmanaged')).toBeInTheDocument();
  });
});
