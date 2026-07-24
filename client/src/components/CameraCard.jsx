import { useState, useEffect } from 'react';
import { getLatestRecording, videoUrl } from '../api/client.js';

export default function CameraCard({ camera, selected, onSelect, onOpen }) {
  const [thumbRec, setThumbRec] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getLatestRecording(camera.id)
      .then(rec => { if (!cancelled && rec?.videoRelPath) setThumbRec(rec); })
      .catch(() => {}); // fall back to the placeholder icon
    return () => { cancelled = true; };
  }, [camera.id]);

  return (
    <div
      className={`camera-card${selected ? ' selected' : ''}`}
      onClick={onOpen}
    >
      <div className="card-thumb">
        {thumbRec ? (
          // Seeking to a fragment forces the browser to decode and display
          // that frame as a static thumbnail, without playing the video.
          <video
            className="card-thumb-video"
            src={`${videoUrl(camera.id, thumbRec.videoRelPath)}#t=0.5`}
            muted
            preload="metadata"
            playsInline
          />
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M15.75 10.5l4.72-2.36A1 1 0 0122 9.07v5.86a1 1 0 01-1.53.85L15.75 13.5M4 8.5A2.5 2.5 0 016.5 6h8A2.5 2.5 0 0117 8.5v7a2.5 2.5 0 01-2.5 2.5h-8A2.5 2.5 0 014 15.5v-7z" />
          </svg>
        )}
      </div>
      <div className="card-footer" onClick={e => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          title="Select for multi-camera playback"
        />
        <span className="card-name" title={camera.name}>{camera.name}</span>
        <button className="btn-view" onClick={onOpen}>View</button>
      </div>
    </div>
  );
}
