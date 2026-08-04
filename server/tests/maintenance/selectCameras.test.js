import { describe, it, expect } from 'vitest';
import { selectManagedCameras, findUnmatchedCameraIds } from '../../maintenance/selectCameras.js';

const CAMERAS = [
  { id: 'axis-aaa', name: 'axis-aaa' },
  { id: 'axis-bbb', name: 'axis-bbb' },
  { id: 'axis-ccc', name: 'axis-ccc' },
];

describe('selectManagedCameras', () => {
  it('returns nothing when no camera IDs are configured', () => {
    expect(selectManagedCameras(CAMERAS, [])).toEqual([]);
  });

  it('returns only the configured cameras, unlisted ones excluded', () => {
    const result = selectManagedCameras(CAMERAS, ['axis-bbb']);
    expect(result).toEqual([{ id: 'axis-bbb', name: 'axis-bbb' }]);
  });

  it('ignores configured IDs that do not match any real camera', () => {
    const result = selectManagedCameras(CAMERAS, ['axis-bbb', 'no-such-camera']);
    expect(result).toEqual([{ id: 'axis-bbb', name: 'axis-bbb' }]);
  });
});

describe('findUnmatchedCameraIds', () => {
  it('returns an empty array when every configured ID matches a real camera', () => {
    expect(findUnmatchedCameraIds(CAMERAS, ['axis-aaa', 'axis-ccc'])).toEqual([]);
  });

  it('flags configured IDs with no matching camera (likely a typo)', () => {
    expect(findUnmatchedCameraIds(CAMERAS, ['axis-bbb', 'axis-typo'])).toEqual(['axis-typo']);
  });
});
