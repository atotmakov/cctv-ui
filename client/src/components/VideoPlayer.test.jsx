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

// ── Overlapping recordings (8× freeze, 23 Oct 2026) ───────────────────────────
// Camera axis-00408CF0FE28 recorded 14:27:35.118 → 14:28:10.200 and then
// 14:28:09.840 → 14:28:14.932. When the first ended, PlaybackView seeked to the
// second's start, which also falls inside the first — the player rewound the
// ended first clip instead, left it paused, and playback froze.
describe('VideoPlayer — overlapping recordings', () => {
  const OVERLAP = [
    { token: 'a', startTime: '2026-10-23T11:27:35.118Z', stopTime: '2026-10-23T11:28:10.200Z', videoRelPath: 'a.mkv' },
    { token: 'b', startTime: '2026-10-23T11:28:09.840Z', stopTime: '2026-10-23T11:28:14.932Z', videoRelPath: 'b.mkv' },
  ];

  it('a seek into the overlap loads the recording that started last', () => {
    const { rerender } = render(<VideoPlayer {...BASE} recordings={OVERLAP} playing seekTarget="2026-10-23T11:28:00.000Z" />);
    expect(videoUrl).toHaveBeenLastCalledWith('cam-1', 'a.mkv');
    rerender(<VideoPlayer {...BASE} recordings={OVERLAP} playing seekTarget="2026-10-23T11:28:09.840Z" />);
    expect(videoUrl).toHaveBeenLastCalledWith('cam-1', 'b.mkv');
  });

  it('a seek within the current recording resumes a paused video while playing', () => {
    const play = vi.spyOn(window.HTMLMediaElement.prototype, 'play');
    const { rerender } = render(<VideoPlayer {...BASE} playing seekTarget="2026-04-06T18:36:26.000Z" />);
    play.mockClear();
    rerender(<VideoPlayer {...BASE} playing seekTarget="2026-04-06T18:36:30.000Z" />);
    expect(play).toHaveBeenCalled();
    play.mockRestore();
  });
});
