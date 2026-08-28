import { promises as fs } from 'fs';
import path from 'path';
import config from '../config.js';

export function cameraPath(cameraId) {
  return path.join(config.storagePath, cameraId);
}

export function dbPath(cameraId) {
  return path.join(config.storagePath, cameraId, 'index.db');
}

// Dedicated file the maintenance job writes to for a camera it manages (see
// maintenance/selectCameras.js) — never a camera with its own native
// index.db, so this filename is exclusively ours whenever it's in use.
export function managedDbPath(cameraId) {
  return path.join(config.storagePath, cameraId, 'index_[managed].db');
}

// Small JSON summary the maintenance job writes after each real (non-dry-run)
// run, at the storage root rather than under any camera folder — read by the
// viewer app's maintenance status route. Never written by the viewer itself.
export function maintenanceStatusPath() {
  return path.join(config.storagePath, 'maintenance-status.json');
}

// Heartbeat written by the camera itself, not by anything in this codebase —
// the acap-sd-s3-sync ACAP app (github.com/atotmakov/axis/acap-sd-s3-sync)
// uploads this to <Prefix>status.json on its own timer (default every 300s)
// so an otherwise-unreachable, outbound-only camera has some way to report
// whether it's alive and how its last S3 sync pass went. Only cameras
// running that app have this file at all — most won't.
export function heartbeatPath(cameraId) {
  return path.join(config.storagePath, cameraId, 'status.json');
}

// Synology filesystem-internal directories (@eaDir thumbnail/attribute
// caches, #recycle bins, etc.) show up alongside real camera folders in
// every share directory. They're not cameras — critically, they also have
// no native index.db, so without this filter the maintenance job's
// auto-detection (see maintenance/selectCameras.js) would "manage" them:
// running retention deletion and index rebuilds against filesystem
// internals. Confirmed happening in production logs for @eaDir.
const RESERVED_DIR_PATTERN = /^[@#]/;

export async function listCameras() {
  const entries = await fs.readdir(config.storagePath, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory() && !RESERVED_DIR_PATTERN.test(e.name))
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
