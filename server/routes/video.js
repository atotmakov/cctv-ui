import { Router } from 'express';
import { promises as fs } from 'fs';
import { createReadStream } from 'fs';
import path from 'path';
import config from '../config.js';

const router = Router();

/**
 * GET /api/video/:cameraId/*
 *
 * Serves any file under {storagePath}/{cameraId}/ with HTTP range support
 * so the browser <video> element can seek without downloading the whole file.
 *
 * The wildcard path is the videoRelPath returned by the recordings API.
 */
router.get('/:cameraId/*', async (req, res) => {
  const { cameraId } = req.params;
  // Express stores the wildcard in req.params[0]
  const relPath = req.params[0];

  // Prevent directory traversal
  if (/\.\./.test(cameraId) || /\.\./.test(relPath)) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  const absPath = path.join(config.storagePath, cameraId, relPath);

  // Ensure the resolved path stays inside storagePath
  const storageRoot = path.resolve(config.storagePath);
  if (!path.resolve(absPath).startsWith(storageRoot)) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  let stat;
  try {
    stat = await fs.stat(absPath);
  } catch {
    return res.status(404).json({ error: 'File not found' });
  }

  const fileSize = stat.size;
  const rangeHeader = req.headers.range;

  const headers = {
    'Content-Type': 'video/x-matroska',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  };

  if (rangeHeader) {
    const [startStr, endStr] = rangeHeader.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize || start > end) {
      res.status(416).set('Content-Range', `bytes */${fileSize}`).end();
      return;
    }

    res.writeHead(206, {
      ...headers,
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Content-Length': end - start + 1,
    });
    createReadStream(absPath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { ...headers, 'Content-Length': fileSize });
    createReadStream(absPath).pipe(res);
  }
});

export default router;
