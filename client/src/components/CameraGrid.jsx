import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getCameras, getVersion } from '../api/client.js';
import CameraCard from './CameraCard.jsx';
import './CameraGrid.css';

const GAP = 16;
const THUMB_ASPECT = 16 / 9;
// Used only until the real .card-footer height is measured from the DOM
// (see the useLayoutEffect below) — footer content is fixed-size/single-line,
// so one measurement is valid for every card and never changes with width.
const FALLBACK_FOOTER_H = 44;

// Finds the column count (1..n) that maximizes camera-cell width while
// keeping every cell's thumbnail at a fixed 16:9 ratio and fitting the full
// grid inside containerW x containerH without scrolling — same "maximize
// tile size that fits" approach video-conferencing gallery views use.
function computeGridLayout(n, containerW, containerH, footerH) {
  if (n === 0 || containerW <= 0 || containerH <= 0) {
    return { cols: 1, cellWidth: 0 };
  }

  let bestCols = 1;
  let bestWidth = 0;

  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);

    const widthConstrained = (containerW - GAP * (cols - 1)) / cols;
    const heightConstrained =
      ((containerH - GAP * (rows - 1)) / rows - footerH) * THUMB_ASPECT;

    const cellWidth = Math.max(0, Math.min(widthConstrained, heightConstrained));
    if (cellWidth > bestWidth) {
      bestWidth = cellWidth;
      bestCols = cols;
    }
  }

  return { cols: bestCols, cellWidth: bestWidth };
}

export default function CameraGrid() {
  const [cameras, setCameras] = useState([]);
  const [version, setVersion] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  // Always mounted (unlike the old early-return loading/error branches,
  // which rendered a tree without this div at all) so the ResizeObserver
  // effect below has a stable ref to attach to from the very first render.
  const bodyRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [footerH, setFooterH] = useState(FALLBACK_FOOTER_H);

  useEffect(() => {
    getCameras()
      .then(setCameras)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    getVersion()
      .then(({ version }) => setVersion(version))
      .catch(() => {});
  }, []);

  // Track available space for the grid so cells can be sized to fill it.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Real footer height (checkbox + name + button row) — replaces the
  // fallback estimate once cards actually exist in the DOM.
  useLayoutEffect(() => {
    if (cameras.length === 0) return;
    const footer = bodyRef.current?.querySelector('.card-footer');
    const h = footer?.getBoundingClientRect().height;
    if (h) setFooterH(h);
  }, [cameras.length]);

  const { cols, cellWidth } = useMemo(
    () => computeGridLayout(cameras.length, size.w, size.h, footerH),
    [cameras.length, size.w, size.h, footerH]
  );

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function openPlayback(cameraId) {
    navigate(`/playback/${encodeURIComponent(cameraId)}`);
  }

  function openSelected() {
    if (selected.size === 0) return;
    navigate(`/playback/${[...selected].map(encodeURIComponent).join(',')}`);
  }

  return (
    <div className="grid-page">
      <header className="grid-header">
        <h1>
          CCTV Viewer
          {version && <span className="version-badge">v{version}</span>}
        </h1>
        <div className="grid-header-actions">
          <Link to="/maintenance" className="btn-view">Maintenance</Link>
          <button
            className="btn-primary"
            disabled={selected.size === 0}
            onClick={openSelected}
          >
            Watch {selected.size > 0 ? selected.size : ''} selected
          </button>
        </div>
      </header>

      <div className="grid-body" ref={bodyRef}>
        {loading ? (
          <div className="grid-state">Loading cameras…</div>
        ) : error ? (
          <div className="grid-state" style={{ color: 'var(--danger)' }}>Error: {error}</div>
        ) : cameras.length === 0 ? (
          <div className="grid-state">No cameras found.</div>
        ) : (
          <div
            className="grid"
            style={cellWidth > 0 ? { gridTemplateColumns: `repeat(${cols}, ${cellWidth}px)` } : undefined}
          >
            {cameras.map(cam => (
              <CameraCard
                key={cam.id}
                camera={cam}
                selected={selected.has(cam.id)}
                onSelect={() => toggleSelect(cam.id)}
                onOpen={() => openPlayback(cam.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
