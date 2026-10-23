// Framework-independent: landmarks use normalized camera coordinates, y grows down.
import { GESTURES } from './chords.js';
export { CHORDS } from './chords.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
const validLandmarks = points => Array.isArray(points) && points.length === 21
  && Array.from(points).every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.z == null || Number.isFinite(p.z)));
function jointCosine(a, b, c) {
  const u = [a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0)];
  const v = [c.x - b.x, c.y - b.y, (c.z ?? 0) - (b.z ?? 0)];
  return u.reduce((sum, n, i) => sum + n * v[i], 0) / (Math.hypot(...u) * Math.hypot(...v) || 1);
}

// Twelve explicit finger combinations; fist is reserved for mute.
// Unlisted combinations do not select a chord.
// World coordinates are metric and unaffected by camera aspect or which side
// of the hand faces the lens. Image landmarks remain useful for size gating.
export function classifyGesture(landmarks, worldLandmarks = null) {
  if (!validLandmarks(landmarks) || distance(landmarks[0], landmarks[9]) < 0.025) return null;
  const points = worldLandmarks ?? landmarks;
  if (!validLandmarks(points)) return null;
  const palm = distance(points[0], points[9]);
  if (palm < 1e-6) return null;
  const fingers = [5, 9, 13, 17].map(mcp => {
    const pip = mcp + 1, dip = mcp + 2, tip = mcp + 3;
    return jointCosine(points[mcp], points[pip], points[tip]) < -0.68
      && jointCosine(points[pip], points[dip], points[tip]) < -0.55
      && distance(points[tip], points[0]) > distance(points[pip], points[0]) * 1.12;
  });
  const thumb = jointCosine(points[2], points[3], points[4]) < -0.65
    && distance(points[4], points[5]) > palm * 0.65
    && distance(points[4], points[17]) > distance(points[3], points[17]) * 1.08;
  const mask = fingers.reduce((bits, extended, i) => bits | (extended ? 1 << (i + 1) : 0), thumb ? 1 : 0);
  if (mask === 0) return 0;
  return GESTURES.find(g => g.mask === mask)?.number ?? null;
}

export class GestureLatch {
  constructor({ dwellMs = 110, lostMs = 450 } = {}) {
    this.dwellMs = dwellMs; this.lostMs = lostMs; this.reset();
  }
  reset() { this.value = null; this.candidate = null; this.since = 0; this.lastValid = -Infinity; this.lastSeen = -Infinity; }
  update(gesture, now) {
    if (now - this.lastSeen > 180) { this.candidate = null; this.since = now; }
    this.lastSeen = now;
    if (gesture !== null) this.lastValid = now;
    if (gesture !== this.candidate) { this.candidate = gesture; this.since = now; }
    if (gesture !== null && now - this.since >= this.dwellMs) this.value = gesture;
    if (now - this.lastValid > this.lostMs) this.value = null;
    return this.value;
  }
}

export class StrumDetector {
  constructor({ line = 0.55, sensitivity = 55, cooldownMs = 115 } = {}) {
    this.line = line; this.sensitivity = sensitivity; this.cooldownMs = cooldownMs; this.reset();
  }
  reset() { this.last = null; this.armed = 0; this.lastHit = -Infinity; }
  update(y, now) {
    if (!Number.isFinite(y)) { this.reset(); return null; }
    const previous = this.last;
    if (!previous || now - previous.time > 180 || now <= previous.time) {
      this.last = { y, time: now }; this.armed = y < this.line - 0.04 ? -1 : y > this.line + 0.04 ? 1 : 0;
      return null;
    }
    const dt = (now - previous.time) / 1000;
    const filtered = previous.y + (y - previous.y) * (1 - Math.exp(-dt / 0.018));
    const velocity = (filtered - previous.y) / dt;
    const threshold = 1.35 - this.sensitivity / 100;
    const crossed = (this.armed === -1 && filtered >= this.line && previous.y < this.line)
      || (this.armed === 1 && filtered <= this.line && previous.y > this.line);
    this.last = { y: filtered, time: now };
    let hit = null;
    if (crossed && Math.abs(velocity) >= threshold && now - this.lastHit >= this.cooldownMs) {
      hit = { direction: velocity > 0 ? 'down' : 'up', velocity: Math.min(1, Math.max(0.25, Math.abs(velocity) / 3)) };
      this.lastHit = now; this.armed = 0;
    }
    if (filtered < this.line - 0.04) this.armed = -1;
    if (filtered > this.line + 0.04) this.armed = 1;
    return hit;
  }
}

export function palmCenter(points) {
  const ids = [0, 5, 9, 13, 17];
  return { x: ids.reduce((v, i) => v + points[i].x, 0) / ids.length, y: ids.reduce((v, i) => v + points[i].y, 0) / ids.length };
}

export function assignHands(result, swapped = false, minScore = 0.65) {
  const roles = { chord: null, strum: null };
  const scores = { chord: 0, strum: 0 };
  result.landmarks?.forEach((points, index) => {
    const hand = result.handedness?.[index]?.[0];
    if (!hand || hand.score < minScore) return;
    const isLeft = hand.categoryName === 'Left';
    const role = (isLeft !== swapped) ? 'chord' : 'strum';
    if (hand.score > scores[role]) { scores[role] = hand.score; roles[role] = points; }
  });
  return roles;
}
