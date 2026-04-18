import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
});
