import { promises as fs } from 'fs';
import path from 'path';
import config from '../config.js';

export function cameraPath(cameraId) {
  return path.join(config.storagePath, cameraId);
}

export function dbPath(cameraId) {
  return path.join(config.storagePath, cameraId, 'index.db');
}

export async function listCameras() {
  const entries = await fs.readdir(config.storagePath, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory())
    .map(e => ({ id: e.name, name: e.name }));
}

export async function listDates(cameraId) {
  const dir = cameraPath(cameraId);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory() && /^\d{8}$/.test(e.name))
    .map(e => e.name)
    .sort();
}

/**
 * Scan a recording token directory and return the path to the .mkv file
 * relative to the camera root (e.g. "20260406/18/Token/20260406_18/block.mkv")
 *
 * Structure:
 *   {date}/{hour}/{token}/
 *     recording.xml
 *     {date}_{hour}/
 *       {blockToken}.mkv
 */
export async function findVideoRelPath(cameraId, date, hour, token) {
  const blockDirName = `${date}_${hour}`;
  const blockDir = path.join(cameraPath(cameraId), date, hour, token, blockDirName);

  let entries;
  try {
    entries = await fs.readdir(blockDir);
  } catch {
    return null;
  }

  const mkv = entries.find(f => f.endsWith('.mkv'));
  return mkv ? `${date}/${hour}/${token}/${blockDirName}/${mkv}` : null;
}

export async function resolveAbsPath(cameraId, relPath) {
  return path.join(cameraPath(cameraId), relPath);
}
