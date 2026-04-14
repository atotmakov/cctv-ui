import { Routes, Route } from 'react-router-dom';
import CameraGrid from './components/CameraGrid.jsx';
import PlaybackView from './components/PlaybackView.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<CameraGrid />} />
      <Route path="/playback/:cameraIds" element={<PlaybackView />} />
    </Routes>
  );
}
