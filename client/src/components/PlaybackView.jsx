import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getRecordings, triggerCache, getCameraDates } from '../api/client.js';
import VideoPlayer from './VideoPlayer.jsx';
import Timeline from './Timeline.jsx';
import './PlaybackView.css';

function isoToDateInput(iso) {
  return iso.slice(0, 10); // YYYY-MM-DD
}

function dateInputToYMD(val) {
  return val.replace(/-/g, ''); // YYYYMMDD
}

function todayYMD() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function formatLocalTime(iso) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const m  = String(d.getMilliseconds()).charAt(0);
  return `${hh}:${mm}:${ss}.${m}`;
}

const SPEEDS = [0.5, 1, 2, 4, 8];

export default function PlaybackView() {
  const { cameraIds } = useParams();
  const cameras = cameraIds.split(',').map(decodeURIComponent);
  const navigate = useNavigate();

  const [date, setDate] = useState(todayYMD());
  const [availableDates, setAvailableDates] = useState([]);
  const [recordingsMap, setRecordingsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [caching, setCaching] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  // seekTarget: ISO string set by timeline click; consumed by VideoPlayer
  const [seekTarget, setSeekTarget] = useState(null);
  // displayTime: ISO string reported by VideoPlayer for timeline cursor
  const [displayTime, setDisplayTime] = useState(null);

  // Load available dates for the first camera (used for date picker hint)
  useEffect(() => {
    if (!cameras[0]) return;
    getCameraDates(cameras[0])
      .then(setAvailableDates)
      .catch(() => {});
  }, [cameras[0]]);

  // Load recordings whenever camera list or date changes
  useEffect(() => {
    setLoading(true);
    setPlaying(false);
    setDisplayTime(null);

    Promise.all(cameras.map(id => getRecordings(id, date)))
      .then(results => {
        const map = {};
        cameras.forEach((id, i) => { map[id] = results[i] ?? []; });
        setRecordingsMap(map);

        // Auto-seek to first available recording
        const first = results.flat().sort((a, b) => a.startTime.localeCompare(b.startTime))[0];
        if (first) setSeekTarget(first.startTime);

        setLoading(false);

        // Pre-cache all cameras for this date
        setCaching(true);
        Promise.all(cameras.map(id => triggerCache(id, date)))
          .catch(() => {})
          .finally(() => setCaching(false));
      })
      .catch(err => {
        console.error('Failed to load recordings:', err);
        setLoading(false);
      });
  }, [cameraIds, date]);

  function handleDateChange(e) {
    setDate(dateInputToYMD(e.target.value));
  }

  function handleSeek(isoTime) {
    setSeekTarget(isoTime);
    setDisplayTime(isoTime);
  }

  // Any camera can drive the timeline cursor — all are synced to the same
  // seekTarget, so their wall-clock times are equivalent. The first camera
  // that has a recording at the current position wins each frame.
  function handleTimeUpdate(_cameraId, isoTime) {
    setDisplayTime(isoTime);
  }

  // When play is pressed: if current position is in a gap, jump to the
  // nearest recording to the right before starting playback.
  function handlePlayPause() {
    if (playing) {
      setPlaying(false);
      return;
    }

    const allRecs = Object.values(recordingsMap)
      .flat()
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    const t = displayTime ? new Date(displayTime).getTime() : 0;
    const inRecording = allRecs.some(r =>
      t >= new Date(r.startTime).getTime() && t <= new Date(r.stopTime).getTime()
    );

    if (!inRecording) {
      // Find nearest recording that starts at or after current position
      const next = allRecs.find(r => new Date(r.startTime).getTime() >= t);
      if (next) {
        setSeekTarget(next.startTime);
        setDisplayTime(next.startTime);
      }
    }

    setPlaying(true);
  }

  // Called when any VideoPlayer's current recording ends.
  // Finds the next recording (by startTime) that begins strictly after the
  // current display time, across all cameras. Seeks to it and keeps playing.
  // If no further recordings exist today, stops playback.
  function handlePlayEnd() {
    const allRecs = Object.values(recordingsMap)
      .flat()
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    const t    = displayTime ? new Date(displayTime).getTime() : 0;
    const next = allRecs.find(r => new Date(r.startTime).getTime() > t);

    if (next) {
      setSeekTarget(next.startTime);
      setDisplayTime(next.startTime);
      // playing stays true — VideoPlayer will start the new rec automatically
    } else {
      setPlaying(false);
    }
  }

  const allRecordings = Object.values(recordingsMap).flat();
  const dateInputValue = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;

  // Grid columns: 1 cam → 1 col, 2–4 → 2, 5–9 → 3, 10–16 → 4
  const cols = cameras.length <= 1 ? 1
             : cameras.length <= 4 ? 2
             : cameras.length <= 9 ? 3
             : 4;

  return (
    <div className="playback-page">
      {/* ── Header ── */}
      <header className="playback-header">
        <button className="btn-back" onClick={() => navigate('/')}>
          ← Cameras
        </button>

        <div className="playback-header-center">
          <input
            type="date"
            value={dateInputValue}
            onChange={handleDateChange}
          />
          {caching && <span className="badge-caching">Caching…</span>}
        </div>

        <div className="speed-bar">
          {SPEEDS.map(s => (
            <button
              key={s}
              className={`btn-speed${speed === s ? ' active' : ''}`}
              onClick={() => setSpeed(s)}
            >
              {s}×
            </button>
          ))}
        </div>
      </header>

      {/* ── Video stack ── */}
      <div className="playback-body">
        {loading ? (
          <div className="playback-state">Loading recordings…</div>
        ) : (
          <div className="players-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {cameras.map(id => (
              <VideoPlayer
                key={id}
                cameraId={id}
                recordings={recordingsMap[id] ?? []}
                seekTarget={seekTarget}
                speed={speed}
                playing={playing}
                currentPlaybackTime={displayTime}
                onTimeUpdate={iso => handleTimeUpdate(id, iso)}
                onPlayEnd={handlePlayEnd}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Footer: transport + timeline ── */}
      <footer className="playback-footer">
        <div className="transport">
          <button className="btn-playpause" onClick={handlePlayPause}>
            {playing ? '⏸' : '▶'}
          </button>
          <span className="time-display">
            {displayTime ? formatLocalTime(displayTime) : '–'}
          </span>
        </div>

        {!loading && allRecordings.length === 0 ? (
          <div className="no-recordings">No recordings for this date.</div>
        ) : (
          <Timeline
            cameras={cameras.map(id => ({ id, recordings: recordingsMap[id] ?? [] }))}
            currentTime={displayTime}
            date={date}
            onSeek={handleSeek}
          />
        )}
      </footer>
    </div>
  );
}
