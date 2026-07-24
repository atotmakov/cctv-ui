import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../api/client.js', () => ({
  getLatestRecording: vi.fn().mockResolvedValue(null),
  videoUrl:           vi.fn(),
}));

import { getLatestRecording, videoUrl } from '../api/client.js';
import CameraCard from './CameraCard.jsx';

const cam = { id: 'front-door', name: 'Front Door' };

describe('CameraCard', () => {
  it('renders camera name', () => {
    render(<CameraCard camera={cam} selected={false} onSelect={vi.fn()} onOpen={vi.fn()} />);
    expect(screen.getByText('Front Door')).toBeInTheDocument();
  });

  it('checkbox is unchecked when selected=false', () => {
    render(<CameraCard camera={cam} selected={false} onSelect={vi.fn()} onOpen={vi.fn()} />);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('checkbox is checked when selected=true', () => {
    render(<CameraCard camera={cam} selected={true} onSelect={vi.fn()} onOpen={vi.fn()} />);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('applies "selected" class when selected=true (AC-2 grid fixed layout)', () => {
    const { container } = render(
      <CameraCard camera={cam} selected={true} onSelect={vi.fn()} onOpen={vi.fn()} />,
    );
    expect(container.querySelector('.camera-card.selected')).toBeInTheDocument();
  });

  it('does not apply "selected" class when selected=false', () => {
    const { container } = render(
      <CameraCard camera={cam} selected={false} onSelect={vi.fn()} onOpen={vi.fn()} />,
    );
    expect(container.querySelector('.camera-card.selected')).toBeNull();
  });

  it('calls onOpen when the View button is clicked (AC-1)', async () => {
    const onOpen = vi.fn();
    render(<CameraCard camera={cam} selected={false} onSelect={vi.fn()} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole('button', { name: /view/i }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('calls onSelect when the checkbox is changed (AC-1)', async () => {
    const onSelect = vi.fn();
    render(<CameraCard camera={cam} selected={false} onSelect={onSelect} onOpen={vi.fn()} />);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('checkbox click does not bubble to onOpen (AC-1)', async () => {
    const onOpen = vi.fn();
    render(<CameraCard camera={cam} selected={false} onSelect={vi.fn()} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('shows the placeholder icon while no recording thumbnail is available', async () => {
    getLatestRecording.mockResolvedValue(null);
    const { container } = render(
      <CameraCard camera={cam} selected={false} onSelect={vi.fn()} onOpen={vi.fn()} />,
    );
    await screen.findByText('Front Door');
    expect(container.querySelector('.card-thumb svg')).toBeInTheDocument();
    expect(container.querySelector('.card-thumb-video')).toBeNull();
  });

  it('shows a video thumbnail once the latest recording resolves', async () => {
    getLatestRecording.mockResolvedValue({ videoRelPath: '20260406/18/TOK1/20260406_18/block.mkv' });
    videoUrl.mockReturnValue('/api/video/front-door/20260406/18/TOK1/20260406_18/block.mkv');
    const { container } = render(
      <CameraCard camera={cam} selected={false} onSelect={vi.fn()} onOpen={vi.fn()} />,
    );
    await waitFor(() => expect(container.querySelector('.card-thumb-video')).toBeInTheDocument());
    expect(container.querySelector('.card-thumb svg')).toBeNull();
  });

  it('shows no age badge when there is no latest recording', async () => {
    getLatestRecording.mockResolvedValue(null);
    const { container } = render(
      <CameraCard camera={cam} selected={false} onSelect={vi.fn()} onOpen={vi.fn()} />,
    );
    await screen.findByText('Front Door');
    expect(container.querySelector('.thumb-age-badge')).toBeNull();
  });

  it('shows "Xm ago" age badge based on the latest recording\'s stop time', async () => {
    const stopTime = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    getLatestRecording.mockResolvedValue({ videoRelPath: null, stopTime });
    render(<CameraCard camera={cam} selected={false} onSelect={vi.fn()} onOpen={vi.fn()} />);
    expect(await screen.findByText('5m ago')).toBeInTheDocument();
  });

  it('shows "just now" for a recording that stopped under a minute ago', async () => {
    const stopTime = new Date(Date.now() - 10 * 1000).toISOString();
    getLatestRecording.mockResolvedValue({ videoRelPath: null, stopTime });
    render(<CameraCard camera={cam} selected={false} onSelect={vi.fn()} onOpen={vi.fn()} />);
    expect(await screen.findByText('just now')).toBeInTheDocument();
  });

  it('shows "Xd ago" for a recording several days old', async () => {
    const stopTime = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    getLatestRecording.mockResolvedValue({ videoRelPath: null, stopTime });
    render(<CameraCard camera={cam} selected={false} onSelect={vi.fn()} onOpen={vi.fn()} />);
    expect(await screen.findByText('3d ago')).toBeInTheDocument();
  });
});
