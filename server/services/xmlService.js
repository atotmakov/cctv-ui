import { promises as fs } from 'fs';
import path from 'path';
import { parseStringPromise } from 'xml2js';
import { cameraPath, findVideoRelPath } from './storageService.js';

export async function parseRecordingXml(xmlPath) {
  try {
    const content = await fs.readFile(xmlPath, 'utf-8');
    const result = await parseStringPromise(content, { explicitArray: false, trim: true });
    const rec = result.Recording;
    if (!rec) return null;

    const videoAttrs = rec.Track?.VideoAttributes ?? {};

    return {
      token: rec.$.RecordingToken,
      startTime: rec.StartTime,
      stopTime: rec.StopTime,
      width: parseInt(videoAttrs.Width) || null,
      height: parseInt(videoAttrs.Height) || null,
      framerate: parseFloat(videoAttrs.Framerate) || null,
      encoding: videoAttrs.Encoding || 'video/x-h264',
    };
  } catch (err) {
    console.warn(`[xmlService] Failed to parse ${xmlPath}: ${err.message}`);
    return null;
  }
}

/**
 * Scan all recordings for a camera on a given date.
 * Returns an array of recording objects sorted by startTime, each including
 * a `videoRelPath` field (path relative to camera root) for the .mkv file.
 */
export async function scanRecordingsForDate(camId, date) {
  const basePath = cameraPath(camId);
  const datePath = path.join(basePath, date);
  const recordings = [];

  let hours;
  try {
    const entries = await fs.readdir(datePath, { withFileTypes: true });
    hours = entries.filter(e => e.isDirectory()).map(e => e.name).sort();
  } catch {
    return [];
  }

  await Promise.all(hours.map(async (hour) => {
    const hourPath = path.join(datePath, hour);
    let tokens;
    try {
      const entries = await fs.readdir(hourPath, { withFileTypes: true });
      tokens = entries.filter(e => e.isDirectory()).map(e => e.name);
    } catch {
      return;
    }

    await Promise.all(tokens.map(async (token) => {
      const xmlPath = path.join(hourPath, token, 'recording.xml');
      const meta = await parseRecordingXml(xmlPath);
      if (!meta) return;

      const videoRelPath = await findVideoRelPath(camId, date, hour, token);

      recordings.push({
        ...meta,
        videoRelPath: videoRelPath ?? null,
      });
    }));
  }));

  return recordings.sort((a, b) => a.startTime.localeCompare(b.startTime));
}
