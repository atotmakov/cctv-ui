import { useRef, useEffect, useState } from 'react';
import { videoUrl } from '../api/client.js';
import './VideoPlayer.css';

function findRecForTime(recordings, isoTime) {
  if (!isoTime) return null;
  const t = new Date(isoTime).getTime();
  return recordings.find(r =>
    t >= new Date(r.startTime).getTime() && t <= new Date(r.stopTime).getTime()
  ) ?? null;
}

function offsetSec(rec, isoTime) {
  return (new Date(isoTime).getTime() - new Date(rec.startTime).getTime()) / 1000;
}

export default function VideoPlayer({
  cameraId,
  recordings,
  seekTarget,
  speed,
  playing,
  currentPlaybackTime,
  onTimeUpdate,
  onPlayEnd,
}) {
  const videoRef     = useRef(null);
  const [activeRec, setActiveRec] = useState(null);
  const lastSeekTarget = useRef(null);
  // Used by handleLoadedMetadata when the recording was switched by the
  // auto-switch effect (not by a seekTarget). Kept separate from
  // lastSeekTarget so the seekTarget effect doesn't get confused.
  const autoLoadTarget = useRef(null);
  // Tracks the last recording token seen via currentPlaybackTime so we only
  // act when the segment changes, not on every rAF frame.
  const lastAutoToken = useRef(null);

  // Refs updated every render — rAF closures always read current values
  const activeRecRef      = useRef(activeRec);
  const onTimeUpdateRef   = useRef(onTimeUpdate);
  activeRecRef.current    = activeRec;
  onTimeUpdateRef.current = onTimeUpdate;

  // rAF handle — started/stopped by video play/pause events (not React state)
  const rafRef = useRef(null);

  function startRaf() {
    if (rafRef.current) return; // already running
    const tick = () => {
      const v   = videoRef.current;
      const rec = activeRecRef.current;
      if (v && rec) {
        onTimeUpdateRef.current(
          new Date(new Date(rec.startTime).getTime() + v.currentTime * 1000).toISOString()
        );
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  function stopRaf() {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }

  // ── External seek ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!seekTarget || seekTarget === lastSeekTarget.current) return;
    lastSeekTarget.current = seekTarget;

    const rec = findRecForTime(recordings, seekTarget);
    if (!rec) { setActiveRec(null); return; }

    if (rec.token !== activeRec?.token) {
      setActiveRec(rec);           // src change → onLoadedMetadata handles seek
    } else if (videoRef.current) {
      videoRef.current.currentTime = offsetSec(rec, seekTarget);
    }
  }, [seekTarget, recordings, activeRec]);

  // ── Auto-switch recording during playback ───────────────────────────────
  // When this camera has no active recording but playback reaches one of its
  // segments (driven by another camera's time), switch into that segment.
  useEffect(() => {
    if (!playing || !currentPlaybackTime) return;
    const rec = findRecForTime(recordings, currentPlaybackTime);
    const token = rec?.token ?? null;
    if (token === lastAutoToken.current) return; // segment unchanged — skip
    lastAutoToken.current = token;
    if (!rec || rec.token === activeRec?.token) return;
    // Store the offset separately — DO NOT touch lastSeekTarget, otherwise
    // the seekTarget effect re-fires (activeRec changed) and calls setActiveRec(null).
    autoLoadTarget.current = currentPlaybackTime;
    setActiveRec(rec);
  }, [playing, currentPlaybackTime, recordings, activeRec]);

  // ── Speed ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed]);

  // ── Play / pause (driven by React `playing` prop) ────────────────────────
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) {
      v.play().catch(err => console.warn('[VideoPlayer] play() failed:', err));
    } else {
      v.pause();
    }
  }, [playing]);

  // ── After new src loads: seek to target offset, resume if playing ─────────
  function handleLoadedMetadata() {
    const v = videoRef.current;
    if (!v || !activeRec) return;
    // autoLoadTarget is set by the auto-switch path; consume it once.
    const target = autoLoadTarget.current ?? lastSeekTarget.current;
    autoLoadTarget.current = null;
    v.currentTime = target ? offsetSec(activeRec, target) : 0;
    v.playbackRate = speed;
    if (playing) {
      v.play().catch(err => console.warn('[VideoPlayer] play() after load failed:', err));
    }
  }

  // ── Video events drive the rAF loop ──────────────────────────────────────
  // onPlay  → video actually started playing in the browser → start rAF
  // onPause → video actually paused in the browser         → stop rAF
  function handlePlay()  { startRaf(); }
  function handlePause() { stopRaf();  }

  // ── Recording ended — let PlaybackView decide what comes next ────────────
  function handleEnded() {
    stopRaf();
    onPlayEnd?.();
  }

  // Cleanup on unmount
  useEffect(() => () => stopRaf(), []);

  const src = activeRec?.videoRelPath
    ? videoUrl(cameraId, activeRec.videoRelPath)
    : null;

  return (
    <div className="video-player">
      <div className="video-label">{cameraId}</div>
      {src ? (
        <video
          ref={videoRef}
          src={src}
          preload="auto"
          playsInline
          controls
          onLoadedMetadata={handleLoadedMetadata}
          onPlay={handlePlay}
          onPause={handlePause}
          onEnded={handleEnded}
        />
      ) : (
        <div className="video-empty">
          {recordings.length === 0
            ? 'No recordings for this date'
            : 'No recording at this time — click the timeline'}
        </div>
      )}
    </div>
  );
}
