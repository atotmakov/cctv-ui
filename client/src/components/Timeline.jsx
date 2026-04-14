import { useRef, useEffect, useCallback, useState } from 'react';
import './Timeline.css';

const DAY_MS  = 24 * 60 * 60 * 1000;
const LABEL_W = 120;
const ROW_H   = 36;
const AXIS_H  = 22;
// Zoom factors: visible window = 24h / zoom
// 1→24h, 2→12h, 4→6h, 8→3h, 24→1h, 48→30m, 96→15m, 144→10m, 288→5m, 720→2m, 1440→1m
const ZOOM_LEVELS = [1, 2, 4, 8, 24, 48, 96, 144, 288, 720, 1440];

function dayStartMs(date) {
  return Date.UTC(
    parseInt(date.slice(0, 4)),
    parseInt(date.slice(4, 6)) - 1,
    parseInt(date.slice(6, 8))
  );
}

function timeFrac(isoStr, startMs) {
  return (new Date(isoStr).getTime() - startMs) / DAY_MS;
}

function fracToIso(frac, startMs) {
  return new Date(startMs + Math.max(0, Math.min(1, frac)) * DAY_MS).toISOString();
}

function clampPan(pan, zoom) {
  return Math.max(0, Math.min(1 - 1 / zoom, pan));
}

// Convert a time fraction to a canvas X coordinate
function fracToX(frac, pan, zoom, barW) {
  return LABEL_W + (frac - pan) * zoom * barW;
}

// Convert a canvas X coordinate to a time fraction
function xToFrac(x, pan, zoom, barW) {
  return (x - LABEL_W) / barW / zoom + pan;
}

export default function Timeline({ recordings, cameras, currentTime, date, onSeek }) {
  const canvasRef  = useRef(null);
  const dragging   = useRef(false);
  const panDrag    = useRef(null); // { startX, startPan }

  const [zoom, setZoom]   = useState(1);
  const [pan,  setPan]    = useState(0); // fraction of day at left edge

  const rows = cameras && cameras.length > 0
    ? cameras
    : [{ id: null, recordings: recordings ?? [] }];
  const multiRow = rows.length > 1;

  // Auto-pan to keep currentTime in view when zoom > 1
  useEffect(() => {
    if (!currentTime || !date || zoom === 1) return;
    const frac    = timeFrac(currentTime, dayStartMs(date));
    const visible = 1 / zoom;
    setPan(prev => {
      if (frac < prev + visible * 0.1) return clampPan(frac - visible * 0.1, zoom);
      if (frac > prev + visible * 0.9) return clampPan(frac - visible * 0.9, zoom);
      return prev;
    });
  }, [currentTime, date, zoom]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !date) return;

    const dpr  = window.devicePixelRatio || 1;
    const cssW = canvas.offsetWidth;
    const cssH = canvas.offsetHeight;

    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width  = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.getContext('2d').scale(dpr, dpr);
    }

    const ctx    = canvas.getContext('2d');
    const W      = cssW;
    const barW   = W - LABEL_W;
    const startMs = dayStartMs(date);

    ctx.clearRect(0, 0, W, cssH);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, W, cssH);

    // ── Camera rows ──────────────────────────────────────────────────────────
    rows.forEach((row, i) => {
      const y0 = i * ROW_H;

      ctx.fillStyle = i % 2 === 0 ? '#161616' : '#121212';
      ctx.fillRect(0, y0, W, ROW_H);

      if (multiRow && row.id) {
        ctx.fillStyle    = '#555';
        ctx.font         = '10px monospace';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          row.id.length > 14 ? row.id.slice(-14) : row.id,
          6, y0 + ROW_H / 2
        );
      }

      ctx.fillStyle = '#3b82f6';
      for (const rec of row.recordings) {
        if (!rec.startTime || !rec.stopTime) continue;
        const x1 = fracToX(timeFrac(rec.startTime, startMs), pan, zoom, barW);
        const x2 = fracToX(timeFrac(rec.stopTime,  startMs), pan, zoom, barW);
        if (x2 < LABEL_W || x1 > W) continue; // out of visible range
        const cx1 = Math.max(x1, LABEL_W);
        const cx2 = Math.min(x2, W);
        ctx.fillRect(cx1, y0 + 4, Math.max(cx2 - cx1, 2), ROW_H - 8);
      }
    });

    // ── Hour / minute axis ───────────────────────────────────────────────────
    const axisY   = rows.length * ROW_H;
    const visible = 1 / zoom;               // fraction of day visible
    const totalMinutes = visible * 24 * 60;

    // Pick a sensible tick interval
    let tickMinutes;
    if      (totalMinutes <= 10)   tickMinutes = 1;
    else if (totalMinutes <= 30)   tickMinutes = 5;
    else if (totalMinutes <= 90)   tickMinutes = 15;
    else if (totalMinutes <= 240)  tickMinutes = 30;
    else if (totalMinutes <= 720)  tickMinutes = 60;
    else if (totalMinutes <= 1440) tickMinutes = 180;
    else                           tickMinutes = 360;

    const labelEvery = totalMinutes <= 120 ? tickMinutes : tickMinutes * 3;

    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, axisY, W, AXIS_H);

    ctx.strokeStyle  = '#2a2a2a';
    ctx.fillStyle    = '#555';
    ctx.font         = '10px monospace';
    ctx.textBaseline = 'middle';
    ctx.lineWidth    = 1;

    // Vertical grid lines
    ctx.strokeStyle = '#1e1e1e';
    const firstTick = Math.ceil(pan * 24 * 60 / tickMinutes) * tickMinutes;
    for (let m = firstTick; m <= (pan + visible) * 24 * 60; m += tickMinutes) {
      const frac = m / (24 * 60);
      const x    = fracToX(frac, pan, zoom, barW);
      if (x < LABEL_W || x > W) continue;

      ctx.strokeStyle = '#1e1e1e';
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, axisY);
      ctx.stroke();

      // Axis tick
      ctx.strokeStyle = '#333';
      ctx.beginPath();
      ctx.moveTo(x, axisY);
      ctx.lineTo(x, axisY + 6);
      ctx.stroke();

      if (m % labelEvery === 0) {
        const hh = String(Math.floor(m / 60)).padStart(2, '0');
        const mm = String(m % 60).padStart(2, '0');
        ctx.fillStyle = '#555';
        ctx.fillText(`${hh}:${mm}`, x + 3, axisY + AXIS_H / 2 + 2);
      }
    }

    // ── Current-time cursor ──────────────────────────────────────────────────
    if (currentTime) {
      const frac = timeFrac(currentTime, startMs);
      const x    = fracToX(frac, pan, zoom, barW);
      if (x >= LABEL_W && x <= W) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, axisY);
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(x - 4, 0);
        ctx.lineTo(x + 4, 0);
        ctx.lineTo(x, 7);
        ctx.closePath();
        ctx.fill();

        ctx.lineWidth = 1;
      }
    }
  }, [rows, currentTime, date, zoom, pan, multiRow]);

  useEffect(() => { draw(); }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw]);

  // ── Zoom via scroll wheel ────────────────────────────────────────────────
  function handleWheel(e) {
    e.preventDefault();
    const canvas  = canvasRef.current;
    const rect    = canvas.getBoundingClientRect();
    const barW    = rect.width - LABEL_W;
    const mouseX  = e.clientX - rect.left;
    const pivotFrac = xToFrac(mouseX, pan, zoom, barW);

    const dir      = e.deltaY < 0 ? 1 : -1;
    const curIdx   = ZOOM_LEVELS.indexOf(zoom);
    const newIdx   = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, curIdx + dir));
    const newZoom  = ZOOM_LEVELS[newIdx];
    const newPan   = clampPan(pivotFrac - (mouseX - LABEL_W) / barW / newZoom, newZoom);

    setZoom(newZoom);
    setPan(newPan);
  }

  // ── Seek / pan mouse handlers ────────────────────────────────────────────
  function handleMouseDown(e) {
    const canvas = canvasRef.current;
    const rect   = canvas.getBoundingClientRect();
    const barW   = rect.width - LABEL_W;
    const frac   = xToFrac(e.clientX - rect.left, pan, zoom, barW);

    if (e.button === 2 || e.altKey) {
      // Right-click or Alt+drag → pan
      panDrag.current = { startX: e.clientX, startPan: pan };
    } else {
      dragging.current = true;
      onSeek(fracToIso(frac, dayStartMs(date)));
    }
  }

  function handleMouseMove(e) {
    const canvas = canvasRef.current;
    const rect   = canvas.getBoundingClientRect();
    const barW   = rect.width - LABEL_W;

    if (panDrag.current) {
      const dx      = e.clientX - panDrag.current.startX;
      const dfrac   = -dx / barW / zoom;
      setPan(clampPan(panDrag.current.startPan + dfrac, zoom));
    } else if (dragging.current) {
      const frac = xToFrac(e.clientX - rect.left, pan, zoom, barW);
      onSeek(fracToIso(frac, dayStartMs(date)));
    }
  }

  function handleMouseUp()    { dragging.current = false; panDrag.current = null; }
  function handleMouseLeave() { dragging.current = false; panDrag.current = null; }

  // ── Zoom buttons ─────────────────────────────────────────────────────────
  function zoomBy(dir) {
    setZoom(prev => {
      const idx     = ZOOM_LEVELS.indexOf(prev);
      const newZoom = ZOOM_LEVELS[Math.max(0, Math.min(ZOOM_LEVELS.length - 1, idx + dir))];
      // Keep current time centred
      if (currentTime && date) {
        const frac = timeFrac(currentTime, dayStartMs(date));
        setPan(clampPan(frac - 1 / newZoom / 2, newZoom));
      }
      return newZoom;
    });
  }

  const cssHeight = rows.length * ROW_H + AXIS_H;
  const visibleMins = (24 * 60) / zoom;
  const zoomLabel = visibleMins >= 60
    ? `${(visibleMins / 60).toFixed(0)}h`
    : `${visibleMins.toFixed(0)}m`;

  return (
    <div className="timeline-outer">
      <div className="timeline-zoom-bar">
        <button className="btn-zoom" onClick={() => zoomBy(-1)} disabled={zoom === ZOOM_LEVELS[0]} title="Zoom out">−</button>
        <span className="zoom-label">{zoomLabel}</span>
        <button className="btn-zoom" onClick={() => zoomBy(1)}  disabled={zoom === ZOOM_LEVELS[ZOOM_LEVELS.length - 1]} title="Zoom in">+</button>
      </div>
      <div className="timeline-wrapper" style={{ height: cssHeight }}>
        <canvas
          ref={canvasRef}
          className="timeline-canvas"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onWheel={handleWheel}
          onContextMenu={e => e.preventDefault()}
        />
      </div>
    </div>
  );
}
