import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../api/client.js', () => ({
  getCameras:     vi.fn(),
  getCameraDates: vi.fn(),
  getRecordings:  vi.fn(),
  triggerCache:   vi.fn(),
  videoUrl:       vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

import { getCameras } from '../api/client.js';
import CameraGrid from './CameraGrid.jsx';

function renderGrid() {
  return render(<MemoryRouter><CameraGrid /></MemoryRouter>);
}

function makeCams(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `cam-${i + 1}`, name: `Camera ${i + 1}` }));
}

beforeEach(() => vi.clearAllMocks());

// ── Loading / error ───────────────────────────────────────────────────────────
describe('CameraGrid — states', () => {
  it('shows loading indicator before data arrives', () => {
    getCameras.mockReturnValue(new Promise(() => {}));
    renderGrid();
    expect(screen.getByText(/loading cameras/i)).toBeInTheDocument();
  });

  it('shows error message when getCameras rejects', async () => {
    getCameras.mockRejectedValue(new Error('Network failure'));
    renderGrid();
    await waitFor(() => expect(screen.getByText(/network failure/i)).toBeInTheDocument());
  });

  it('shows "No cameras found" when API returns empty array', async () => {
    getCameras.mockResolvedValue([]);
    renderGrid();
    await waitFor(() => expect(screen.getByText(/no cameras found/i)).toBeInTheDocument());
  });
});

// ── AC-1: grid renders 1–16 cameras ──────────────────────────────────────────
describe('CameraGrid — AC-1: grid for 1–16 cameras', () => {
  it.each([1, 4, 8, 16])('renders %i cameras', async (n) => {
    getCameras.mockResolvedValue(makeCams(n));
    renderGrid();
    await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(n));
    for (let i = 1; i <= n; i++) {
      expect(screen.getByText(`Camera ${i}`)).toBeInTheDocument();
    }
  });
});

// ── AC-1: single camera navigation ───────────────────────────────────────────
describe('CameraGrid — AC-1: single camera navigation', () => {
  it('View button navigates to /playback/<id>', async () => {
    getCameras.mockResolvedValue([{ id: 'cam-1', name: 'Camera 1' }]);
    renderGrid();
    await waitFor(() => screen.getByText('Camera 1'));
    await userEvent.click(screen.getByRole('button', { name: /view/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/playback/cam-1');
  });

  it('clicking the card also navigates to /playback/<id>', async () => {
    getCameras.mockResolvedValue([{ id: 'cam-2', name: 'Camera 2' }]);
    renderGrid();
    await waitFor(() => screen.getByText('Camera 2'));
    await userEvent.click(screen.getByText('Camera 2').closest('.camera-card'));
    expect(mockNavigate).toHaveBeenCalledWith('/playback/cam-2');
  });
});

// ── AC-1: multi-select ────────────────────────────────────────────────────────
describe('CameraGrid — AC-1: multi-select', () => {
  beforeEach(async () => {
    getCameras.mockResolvedValue(makeCams(3));
    renderGrid();
    await waitFor(() => screen.getAllByRole('checkbox'));
  });

  it('Watch button is disabled when nothing is selected', () => {
    expect(screen.getByRole('button', { name: /watch/i })).toBeDisabled();
  });

  it('selecting one camera enables Watch and shows count', async () => {
    await userEvent.click(screen.getAllByRole('checkbox')[0]);
    expect(screen.getByRole('button', { name: /watch 1/i })).toBeEnabled();
  });

  it('selecting 2 cameras and clicking Watch navigates with both ids (AC-1)', async () => {
    const boxes = screen.getAllByRole('checkbox');
    await userEvent.click(boxes[0]);
    await userEvent.click(boxes[1]);
    await userEvent.click(screen.getByRole('button', { name: /watch 2/i }));
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringMatching(/^\/playback\/.+,.+/),
    );
  });

  it('deselecting removes camera from selection', async () => {
    const box = screen.getAllByRole('checkbox')[0];
    await userEvent.click(box);
    await userEvent.click(box);
    expect(screen.getByRole('button', { name: /watch/i })).toBeDisabled();
  });
});
