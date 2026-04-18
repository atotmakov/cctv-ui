import '@testing-library/jest-dom';

// ── ResizeObserver ────────────────────────────────────────────────────────────
// jsdom does not implement ResizeObserver; Timeline.jsx calls ro.observe().
global.ResizeObserver = class ResizeObserver {
  observe()    {}
  unobserve()  {}
  disconnect() {}
};

// ── HTMLCanvasElement.getContext ──────────────────────────────────────────────
// Timeline.jsx calls canvas.getContext('2d') and draws into it.
// Provide a no-op 2D context stub so no errors are thrown.
HTMLCanvasElement.prototype.getContext = function (type) {
  if (type !== '2d') return null;
  return {
    scale:        () => {},
    clearRect:    () => {},
    fillRect:     () => {},
    strokeRect:   () => {},
    beginPath:    () => {},
    moveTo:       () => {},
    lineTo:       () => {},
    closePath:    () => {},
    stroke:       () => {},
    fill:         () => {},
    fillText:     () => {},
    measureText:  () => ({ width: 0 }),
    arc:          () => {},
    save:         () => {},
    restore:      () => {},
    fillStyle:    '',
    strokeStyle:  '',
    lineWidth:    1,
    font:         '',
    textBaseline: '',
    globalAlpha:  1,
  };
};

// ── getBoundingClientRect ─────────────────────────────────────────────────────
// Timeline mouse handlers call canvas.getBoundingClientRect().
HTMLCanvasElement.prototype.getBoundingClientRect = function () {
  return { left: 0, top: 0, width: 800, height: 100, right: 800, bottom: 100 };
};

// ── HTMLMediaElement ──────────────────────────────────────────────────────────
// jsdom does not implement play/pause; VideoPlayer calls them.
window.HTMLMediaElement.prototype.play  = () => Promise.resolve();
window.HTMLMediaElement.prototype.pause = () => {};
window.HTMLMediaElement.prototype.load  = () => {};

// ── requestAnimationFrame / cancelAnimationFrame ──────────────────────────────
// VideoPlayer.jsx uses rAF for its time-update loop.
let rafId = 0;
global.requestAnimationFrame  = (cb) => { const id = ++rafId; Promise.resolve().then(() => cb(performance.now())); return id; };
global.cancelAnimationFrame   = () => {};
