/**
 * Filters the full camera list down to only those explicitly listed in
 * MAINTENANCE_CAMERAS. Cameras not listed are left entirely alone — they
 * may still be actively managed by the camera itself (own retention, own
 * index.db); an empty/unset list means "manage nothing," never "manage
 * everything."
 */
export function selectManagedCameras(cameras, maintenanceCameraIds) {
  const ids = new Set(maintenanceCameraIds);
  return cameras.filter(c => ids.has(c.id));
}

/** Configured IDs that don't match any actual camera — likely a typo. */
export function findUnmatchedCameraIds(cameras, maintenanceCameraIds) {
  const knownIds = new Set(cameras.map(c => c.id));
  return maintenanceCameraIds.filter(id => !knownIds.has(id));
}
