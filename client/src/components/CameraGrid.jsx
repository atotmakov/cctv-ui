import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCameras } from '../api/client.js';
import CameraCard from './CameraCard.jsx';
import './CameraGrid.css';

export default function CameraGrid() {
  const [cameras, setCameras] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    getCameras()
      .then(setCameras)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

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

  if (loading) return <div className="grid-page"><div className="grid-state">Loading cameras…</div></div>;
  if (error)   return <div className="grid-page"><div className="grid-state" style={{ color: 'var(--danger)' }}>Error: {error}</div></div>;

  return (
    <div className="grid-page">
      <header className="grid-header">
        <h1>CCTV Viewer</h1>
        <button
          className="btn-primary"
          disabled={selected.size === 0}
          onClick={openSelected}
        >
          Watch {selected.size > 0 ? selected.size : ''} selected
        </button>
      </header>

      {cameras.length === 0 ? (
        <div className="grid-state">No cameras found.</div>
      ) : (
        <div className="grid">
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
  );
}
