import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../api/client.js', () => ({
  getCameras:     vi.fn(),
  getCameraDates: vi.fn(),
  getRecordings:  vi.fn(),
  triggerCache:   vi.fn(),
  videoUrl:       vi.fn((camId, relPath) => `/api/video/${camId}/${relPath}`),
}));

import { videoUrl } from '../api/client.js';
import VideoPlayer from './VideoPlayer.jsx';

const RECS = [
  {
    token:        'tok-1',
    startTime:    '2026-04-06T18:36:25.000Z',
    stopTime:     '2026-04-06T18:36:38.000Z',
    videoRelPath: '20260406/18/tok-1/20260406_18/block.mkv',
  },
  {
    token:        'tok-2',
    startTime:    '2026-04-06T19:51:02.000Z',
    stopTime:     '2026-04-06T19:51:14.000Z',
    videoRelPath: '20260406/19/tok-2/20260406_19/block.mkv',
  },
];

const BASE = {
  cameraId:            'cam-1',
  recordings:          RECS,
  seekTarget:          null,
  speed:               1,
  playing:             false,
  currentPlaybackTime: null,
  onTimeUpdate:        vi.fn(),
  onPlayEnd:           vi.fn(),
};

beforeEach(() => vi.clearAllMocks());

// ── AC-2: placeholder states ──────────────────────────────────────────────────
describe('VideoPlayer — placeholder states (AC-2)', () => {
  it('shows "No recordings for this date" when recordings is empty', () => {
    render(<VideoPlayer {...BASE} recordings={[]} />);
    expect(screen.getByText(/no recordings for this date/i)).toBeInTheDocument();
  });

  it('shows no <video> element when recordings is empty', () => {
    const { container } = render(<VideoPlayer {...BASE} recordings={[]} />);
    expect(container.querySelector('video')).toBeNull();
  });

  it('shows "No recording at this time" when recordings exist but none is active', () => {
    // seekTarget is null → activeRec stays null
    render(<VideoPlayer {...BASE} />);
    expect(screen.getByText(/no recording at this time/i)).toBeInTheDocument();
  });

  it('placeholder persists when seekTarget falls in a gap between recordings', () => {
    render(<VideoPlayer {...BASE} seekTarget="2026-04-06T19:00:00.000Z" />);
    expect(screen.getByText(/no recording at this time/i)).toBeInTheDocument();
  });
});

// ── AC-2: camera label ────────────────────────────────────────────────────────
describe('VideoPlayer — camera label', () => {
  it('displays the cameraId as label', () => {
    render(<VideoPlayer {...BASE} />);
    expect(screen.getByText('cam-1')).toBeInTheDocument();
  });
});

// ── AC-2: src binding on seek ─────────────────────────────────────────────────
describe('VideoPlayer — seek and src binding (AC-2)', () => {
  it('calls videoUrl with correct args when seekTarget matches a recording', () => {
    render(<VideoPlayer {...BASE} seekTarget="2026-04-06T18:36:30.000Z" />);
    expect(videoUrl).toHaveBeenCalledWith('cam-1', RECS[0].videoRelPath);
  });

  it('renders a <video> element when a recording is active', () => {
    const { container } = render(
      <VideoPlayer {...BASE} seekTarget="2026-04-06T18:36:30.000Z" />,
    );
    expect(container.querySelector('video')).toBeInTheDocument();
  });

  it('switches to the second recording when seekTarget moves there', () => {
    const { rerender } = render(
      <VideoPlayer {...BASE} seekTarget="2026-04-06T18:36:30.000Z" />,
    );
    rerender(<VideoPlayer {...BASE} seekTarget="2026-04-06T19:51:05.000Z" />);
    expect(videoUrl).toHaveBeenLastCalledWith('cam-1', RECS[1].videoRelPath);
  });
});
