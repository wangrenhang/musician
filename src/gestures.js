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
  constructor({ sensitivity = 55, cooldownMs = 40 } = {}) {
    this.sensitivity = sensitivity; this.cooldownMs = cooldownMs; this.reset();
  }
  reset() {
    this.last = null; this.anchor = null; this.heading = null; this.extreme = null;
    this.motion = null; this.lastHit = -Infinity; this.missing = false;
  }
  update(position, now) {
    if (!Number.isFinite(now)) { this.reset(); return null; }
    // A scalar remains useful for vertical-only consumers. The app supplies
    // two-dimensional coordinates in units of image height.
    const point = typeof position === 'number' ? { x: 0, y: position } : position;
    // Motion blur can hide a hand for a frame. Bridge only a short gap;
    // prolonged loss must not turn a newly acquired hand into a strum.
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      this.missing = true;
      if (this.last && (now - this.last.time > 120 || now <= this.last.time)) this.reset();
      return null;
    }
    const sensitivity = Math.min(90, Math.max(10, this.sensitivity));
    const minTravel = 0.075 - (sensitivity - 10) / 80 * 0.047;
    const minSpeed = 1.35 - sensitivity / 100;
    const deadband = minTravel * 0.12;
    const previous = this.last;
    const maxGap = this.missing ? 120 : 180;
    this.missing = false;
    if (!previous || now - previous.time > maxGap || now <= previous.time) {
      this.reset();
      this.last = this.anchor = this.motion = { x: point.x, y: point.y, time: now };
      return null;
    }
    const sample = { x: point.x, y: point.y, time: now };
    this.last = sample;
    // A deliberate pause starts a new stroke, including in the same direction.
    // A moving stroke stays latched even if it lasts longer than the cooldown.
    if (now - this.motion.time > 120) {
      this.heading = null; this.extreme = null; this.anchor = previous; this.motion = previous;
    }
    if (Math.hypot(sample.x - this.motion.x, sample.y - this.motion.y) >= deadband) this.motion = sample;
    if (this.heading) {
      if (now - this.extreme.time > 160) this.extreme = previous;
      const dx = sample.x - this.extreme.x, dy = sample.y - this.extreme.y;
      const travel = Math.hypot(dx, dy);
      const forward = dx * this.heading.x + dy * this.heading.y;
      if (forward > travel * 0.3) { this.extreme = sample; return null; }
      if (travel < deadband) { this.extreme = { ...this.extreme, time: now }; return null; }
      // Enough travel backwards or into a new direction starts the next stroke.
      // Small reversals leave the extremum intact, so jitter cannot retrigger.
      if (travel < minTravel) return null;
      this.anchor = this.extreme;
    } else if (now - this.anchor.time > 160) {
      // Do not accumulate a slow repositioning into a sweep.
      this.anchor = previous;
    }
    const dx = sample.x - this.anchor.x, dy = sample.y - this.anchor.y;
    const travel = Math.hypot(dx, dy);
    const speed = travel * 1000 / (now - this.anchor.time);
    if (travel < minTravel || speed < minSpeed || now - this.lastHit < this.cooldownMs) return null;
    this.heading = { x: dx / travel, y: dy / travel }; this.extreme = sample; this.lastHit = now;
    // Vertical/diagonal strokes follow y; horizontal ones follow the mirrored
    // preview: moving right plays a downstroke and left plays an upstroke.
    const down = Math.abs(dy) >= Math.abs(dx) ? dy > 0 : dx < 0;
    return { direction: down ? 'down' : 'up', velocity: Math.min(1, Math.max(0.25, speed / 3)) };
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
