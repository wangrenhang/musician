// Classic worker: MediaPipe's WASM loader needs importScripts().
// A dynamic ESM import loads the API without changing this worker's classic type.
let landmarker;
self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      const { FilesetResolver, HandLandmarker } = await import('./mediapipe/vision_bundle.mjs');
      const vision = await FilesetResolver.forVisionTasks(data.wasmRoot);
      const options = {
        baseOptions: { modelAssetPath: data.model, delegate: 'GPU' },
        runningMode: 'VIDEO', numHands: 2,
        minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
      };
      let delegate = 'GPU';
      try { landmarker = await HandLandmarker.createFromOptions(vision, options); }
      catch { delegate = 'CPU'; options.baseOptions.delegate = 'CPU'; landmarker = await HandLandmarker.createFromOptions(vision, options); }
      self.postMessage({ type: 'ready', delegate });
    } catch (error) { self.postMessage({ type: 'error', message: error.message }); }
    return;
  }
  if (data.type === 'frame') {
    try {
      const start = performance.now();
      const result = landmarker.detectForVideo(data.bitmap, data.timestamp);
      self.postMessage({ type: 'result', landmarks: result.landmarks, handedness: result.handedness, inferenceMs: performance.now() - start, timestamp: data.timestamp });
    } catch (error) { self.postMessage({ type: 'error', message: error.message }); }
    finally { data.bitmap.close(); }
  }
};
