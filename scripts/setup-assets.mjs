import { cp, mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
await mkdir(path.join(root, 'public/mediapipe'), { recursive: true });
await mkdir(path.join(root, 'public/models'), { recursive: true });
await cp(path.join(root, 'node_modules/@mediapipe/tasks-vision/wasm'), path.join(root, 'public/mediapipe/wasm'), { recursive: true });
await cp(path.join(root, 'node_modules/@mediapipe/tasks-vision/vision_bundle.mjs'), path.join(root, 'public/mediapipe/vision_bundle.mjs'));
const validModel = bytes => bytes.length > 1_000_000 && bytes.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04])) < 8 && bytes.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04])) >= 0;
const modelPath = path.join(root, 'public/models/hand_landmarker.task');
try {
  const bytes = await readFile(modelPath);
  if (!validModel(bytes)) throw new Error('Invalid model archive');
  console.log('Hand model already present.');
} catch {
  const url = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
  console.log('Downloading hand landmark model (~7.5 MB)...');
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Model download: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!validModel(buffer)) throw new Error('Downloaded model is not a valid task archive');
  const temporary = `${modelPath}.download`;
  try { await writeFile(temporary, buffer); await rename(temporary, modelPath); }
  finally { await rm(temporary, { force: true }); }
}
console.log('Local WASM and model are ready.');
