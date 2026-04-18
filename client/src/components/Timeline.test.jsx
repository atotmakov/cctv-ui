import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Timeline from './Timeline.jsx';

// ResizeObserver, canvas stubs, and getBoundingClientRect are in setupTests.js.

const DATE = '20260406';

const RECS = [
  { token: 'a', startTime: '2026-04-06T18:36:25.000Z', stopTime: '2026-04-06T18:36:38.000Z' },
  { token: 'b', startTime: '2026-04-06T19:51:02.000Z', stopTime: '2026-04-06T19:51:14.000Z' },
];

const CAMERAS_TWO = [
  { id: 'cam-1', recordings: RECS },
  { id: 'cam-2', recordings: [RECS[0]] },
];

const DEFAULT = {
  cameras:     [{ id: 'cam-1', recordings: RECS }],
  currentTime: null,
  date:        DATE,
  onSeek:      vi.fn(),
};

beforeEach(() => vi.clearAllMocks());

// ── AC-6: canvas renders ──────────────────────────────────────────────────────
describe('Timeline — canvas (AC-6)', () => {
  it('renders a canvas element', () => {
    const { container } = render(<Timeline {...DEFAULT} />);
    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('renders the timeline-outer wrapper', () => {
    const { container } = render(<Timeline {...DEFAULT} />);
    expect(container.querySelector('.timeline-outer')).toBeInTheDocument();
  });

  it('renders without errors when currentTime is provided (AC-6)', () => {
    expect(() =>
      render(<Timeline {...DEFAULT} currentTime="2026-04-06T18:36:30.000Z" />),
    ).not.toThrow();
  });

  it('renders without errors when currentTime is null', () => {
    expect(() => render(<Timeline {...DEFAULT} />)).not.toThrow();
  });
});

// ── AC-6: zoom controls ───────────────────────────────────────────────────────
describe('Timeline — zoom controls (AC-6)', () => {
  it('renders + and − buttons with titles', () => {
    render(<Timeline {...DEFAULT} />);
    expect(screen.getByTitle('Zoom in')).toBeInTheDocument();
    expect(screen.getByTitle('Zoom out')).toBeInTheDocument();
  });

  it('zoom-out (−) is disabled at minimum zoom (24h view)', () => {
    render(<Timeline {...DEFAULT} />);
    expect(screen.getByTitle('Zoom out')).toBeDisabled();
  });

  it('zoom-in (+) is enabled at minimum zoom', () => {
    render(<Timeline {...DEFAULT} />);
    expect(screen.getByTitle('Zoom in')).toBeEnabled();
  });

  it('shows "24h" label at default zoom', () => {
    render(<Timeline {...DEFAULT} />);
    expect(screen.getByText('24h')).toBeInTheDocument();
  });

  it('clicking zoom-in shows "12h"', async () => {
    render(<Timeline {...DEFAULT} />);
    await userEvent.click(screen.getByTitle('Zoom in'));
    expect(screen.getByText('12h')).toBeInTheDocument();
  });

  it('clicking zoom-in twice shows "6h"', async () => {
    render(<Timeline {...DEFAULT} />);
    await userEvent.click(screen.getByTitle('Zoom in'));
    await userEvent.click(screen.getByTitle('Zoom in'));
    expect(screen.getByText('6h')).toBeInTheDocument();
  });

  it('zoom-out becomes enabled after zooming in', async () => {
    render(<Timeline {...DEFAULT} />);
    await userEvent.click(screen.getByTitle('Zoom in'));
    expect(screen.getByTitle('Zoom out')).toBeEnabled();
  });

  it('zoom-in becomes disabled at maximum zoom (AC-6)', async () => {
    render(<Timeline {...DEFAULT} currentTime="2026-04-06T12:00:00.000Z" />);
    const btn = screen.getByTitle('Zoom in');
    // ZOOM_LEVELS has 11 entries → 10 clicks to reach max
    for (let i = 0; i < 10; i++) await userEvent.click(btn);
    expect(btn).toBeDisabled();
  });
});

// ── AC-6: seek on click ───────────────────────────────────────────────────────
describe('Timeline — seek on mouse click (AC-6)', () => {
  it('calls onSeek with a valid ISO string when clicking the canvas', async () => {
    const onSeek = vi.fn();
    const { container } = render(<Timeline {...DEFAULT} onSeek={onSeek} />);
    const canvas = container.querySelector('canvas');

    await userEvent.pointer([
      { target: canvas, keys: '[MouseLeft]', coords: { clientX: 400, clientY: 20 } },
    ]);

    expect(onSeek).toHaveBeenCalledTimes(1);
    const iso = onSeek.mock.calls[0][0];
    expect(() => new Date(iso)).not.toThrow();
    expect(new Date(iso).getFullYear()).toBe(2026);
    expect(new Date(iso).getMonth()).toBe(3); // April (0-indexed)
    expect(new Date(iso).getDate()).toBe(6);
  });

  it('does not call onSeek on right-click (pan mode)', async () => {
    const onSeek = vi.fn();
    const { container } = render(<Timeline {...DEFAULT} onSeek={onSeek} />);
    const canvas = container.querySelector('canvas');

    await userEvent.pointer([
      { target: canvas, keys: '[MouseRight]', coords: { clientX: 400, clientY: 20 } },
    ]);

    expect(onSeek).not.toHaveBeenCalled();
  });
});

// ── AC-6: multi-camera rows ───────────────────────────────────────────────────
describe('Timeline — multi-camera row heights (AC-6)', () => {
  // ROW_H=36, AXIS_H=22

  it('single camera → wrapper height = 58px (36+22)', () => {
    const { container } = render(<Timeline {...DEFAULT} />);
    expect(container.querySelector('.timeline-wrapper')).toHaveStyle({ height: '58px' });
  });

  it('two cameras → wrapper height = 94px (72+22)', () => {
    const { container } = render(
      <Timeline cameras={CAMERAS_TWO} currentTime={null} date={DATE} onSeek={vi.fn()} />,
    );
    expect(container.querySelector('.timeline-wrapper')).toHaveStyle({ height: '94px' });
  });
});
