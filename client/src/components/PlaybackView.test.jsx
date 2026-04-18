import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../api/client.js', () => ({
  getCameras:     vi.fn(),
  getCameraDates: vi.fn(),
  getRecordings:  vi.fn(),
  triggerCache:   vi.fn(),
  videoUrl:       vi.fn((camId, relPath) => `/api/video/${camId}/${relPath}`),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

import { getCameraDates, getRecordings, triggerCache } from '../api/client.js';
import PlaybackView from './PlaybackView.jsx';

const REC = {
  token:        'tok-a',
  startTime:    '2026-04-06T18:36:25.000Z',
  stopTime:     '2026-04-06T18:36:38.000Z',
  videoRelPath: '20260406/18/tok-a/20260406_18/a.mkv',
};

function renderPlayback(cameraIds = 'cam-1') {
  return render(
    <MemoryRouter initialEntries={[`/playback/${cameraIds}`]}>
      <Routes>
        <Route path="/playback/:cameraIds" element={<PlaybackView />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getCameraDates.mockResolvedValue(['20260406', '20260407', '20260408']);
  getRecordings.mockResolvedValue([REC]);
  triggerCache.mockResolvedValue({ cached: 1 });
});

// ── AC-3: date picker ─────────────────────────────────────────────────────────
describe('PlaybackView — date picker (AC-3)', () => {
  it('renders a date input', async () => {
    renderPlayback();
    await waitFor(() => screen.queryByText(/loading recordings/i) === null);
    // date input has type="date"; query by its value pattern
    const input = document.querySelector('input[type="date"]');
    expect(input).toBeInTheDocument();
    expect(input.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ── AC-3: no recordings message ───────────────────────────────────────────────
describe('PlaybackView — no recordings message (AC-3)', () => {
  it('shows message when all cameras have no recordings for the date', async () => {
    getRecordings.mockResolvedValue([]);
    renderPlayback();
    // The footer .no-recordings div appears when all recordings are empty
    await waitFor(() =>
      expect(document.querySelector('.no-recordings')).toBeInTheDocument(),
    );
  });

  it('does not show no-recordings message when recordings exist', async () => {
    renderPlayback();
    await waitFor(() => screen.queryByText(/loading recordings/i) === null);
    expect(screen.queryByText(/no recordings for this date/i)).toBeNull();
  });
});

// ── AC-2: speed buttons ───────────────────────────────────────────────────────
describe('PlaybackView — speed controls (AC-2)', () => {
  it('renders all speed buttons: 0.5×, 1×, 2×, 4×, 8×', async () => {
    renderPlayback();
    await waitFor(() => screen.queryByText(/loading recordings/i) === null);
    for (const label of ['0.5×', '1×', '2×', '4×', '8×']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('1× is active by default', async () => {
    renderPlayback();
    await waitFor(() => screen.queryByText(/loading recordings/i) === null);
    expect(screen.getByRole('button', { name: '1×' })).toHaveClass('active');
  });

  it('clicking a speed button makes it active', async () => {
    renderPlayback();
    await waitFor(() => screen.queryByText(/loading recordings/i) === null);
    await userEvent.click(screen.getByRole('button', { name: '4×' }));
    expect(screen.getByRole('button', { name: '4×' })).toHaveClass('active');
    expect(screen.getByRole('button', { name: '1×' })).not.toHaveClass('active');
  });
});

// ── AC-2: play/pause ──────────────────────────────────────────────────────────
describe('PlaybackView — play/pause (AC-2)', () => {
  it('renders play button ▶ initially', async () => {
    renderPlayback();
    await waitFor(() => screen.queryByText(/loading recordings/i) === null);
    expect(screen.getByRole('button', { name: '▶' })).toBeInTheDocument();
  });

  it('clicking ▶ switches to ⏸', async () => {
    renderPlayback();
    await waitFor(() => screen.queryByText(/loading recordings/i) === null);
    await userEvent.click(screen.getByRole('button', { name: '▶' }));
    expect(screen.getByRole('button', { name: '⏸' })).toBeInTheDocument();
  });

  it('clicking ⏸ switches back to ▶', async () => {
    renderPlayback();
    await waitFor(() => screen.queryByText(/loading recordings/i) === null);
    await userEvent.click(screen.getByRole('button', { name: '▶' }));
    await userEvent.click(screen.getByRole('button', { name: '⏸' }));
    expect(screen.getByRole('button', { name: '▶' })).toBeInTheDocument();
  });
});

// ── AC-5: cache warming ───────────────────────────────────────────────────────
describe('PlaybackView — cache warming (AC-5)', () => {
  it('calls triggerCache for each camera after recordings load', async () => {
    renderPlayback('cam-1,cam-2');
    await waitFor(() => expect(triggerCache).toHaveBeenCalledTimes(2));
    expect(triggerCache).toHaveBeenCalledWith('cam-1', expect.any(String));
    expect(triggerCache).toHaveBeenCalledWith('cam-2', expect.any(String));
  });

  it('triggerCache failure does not crash the component', async () => {
    triggerCache.mockRejectedValue(new Error('Cache error'));
    renderPlayback();
    await waitFor(() => screen.queryByText(/loading recordings/i) === null);
    expect(screen.getByRole('button', { name: '▶' })).toBeInTheDocument();
  });
});

// ── AC-2: grid column layout ──────────────────────────────────────────────────
describe('PlaybackView — player grid columns (AC-2)', () => {
  async function getColumns(cameraIds) {
    getRecordings.mockResolvedValue([]);
    const { unmount } = renderPlayback(cameraIds);
    await waitFor(() => screen.queryByText(/loading recordings/i) === null);
    const cols = document.querySelector('.players-grid')?.style.gridTemplateColumns ?? '';
    unmount();
    return cols;
  }

  it('1 camera → 1 column',  async () => expect(await getColumns('c1')).toBe('repeat(1, 1fr)'));
  it('2 cameras → 2 columns', async () => expect(await getColumns('c1,c2')).toBe('repeat(2, 1fr)'));
  it('4 cameras → 2 columns', async () => expect(await getColumns('c1,c2,c3,c4')).toBe('repeat(2, 1fr)'));
  it('5 cameras → 3 columns', async () => expect(await getColumns('c1,c2,c3,c4,c5')).toBe('repeat(3, 1fr)'));
  it('9 cameras → 3 columns', async () => expect(await getColumns(Array.from({length:9},(_,i)=>`c${i}`).join(','))).toBe('repeat(3, 1fr)'));
  it('10 cameras → 4 columns',async () => expect(await getColumns(Array.from({length:10},(_,i)=>`c${i}`).join(','))).toBe('repeat(4, 1fr)'));
  it('16 cameras → 4 columns',async () => expect(await getColumns(Array.from({length:16},(_,i)=>`c${i}`).join(','))).toBe('repeat(4, 1fr)'));
});

// ── AC-1: back navigation ─────────────────────────────────────────────────────
describe('PlaybackView — back navigation (AC-1)', () => {
  it('← Cameras button calls navigate("/")', async () => {
    renderPlayback();
    await waitFor(() => screen.queryByText(/loading recordings/i) === null);
    await userEvent.click(screen.getByRole('button', { name: /← cameras/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});
