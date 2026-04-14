const BASE = '/api';

async function json(res) {
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(msg);
  }
  return res.json();
}

export const getCameras = () =>
  fetch(`${BASE}/cameras`).then(json);

export const getCameraDates = (cameraId) =>
  fetch(`${BASE}/cameras/${encodeURIComponent(cameraId)}/dates`).then(json);

export const getRecordings = (cameraId, date) =>
  fetch(`${BASE}/cameras/${encodeURIComponent(cameraId)}/recordings?date=${date}`).then(json);

export const triggerCache = (cameraId, date) =>
  fetch(`${BASE}/cameras/${encodeURIComponent(cameraId)}/cache?date=${date}`, {
    method: 'POST',
  }).then(json);

/**
 * Build the URL for a video file.
 * @param {string} cameraId
 * @param {string} videoRelPath  e.g. "20260406/18/Token/20260406_18/block.mkv"
 */
export function videoUrl(cameraId, videoRelPath) {
  return `${BASE}/video/${encodeURIComponent(cameraId)}/${videoRelPath}`;
}
