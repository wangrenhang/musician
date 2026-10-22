// Framework-independent: landmarks use normalized camera coordinates, y grows down.
export const CHORDS = [
  { number: 1, name: 'C', label: '明亮 · C 大调', frets: [-1, 3, 2, 0, 1, 0], midi: [48, 52, 55, 60, 64] },
  { number: 2, name: 'G', label: '开阔 · G 大调', frets: [3, 2, 0, 0, 0, 3], midi: [43, 47, 50, 55, 59, 67] },
  { number: 3, name: 'Am', label: '温柔 · A 小调', frets: [-1, 0, 2, 2, 1, 0], midi: [45, 52, 57, 60, 64] },
  { number: 4, name: 'F', label: '温暖 · F 大调', frets: [1, 3, 3, 2, 1, 1], midi: [41, 48, 53, 57, 60, 65] },
  { number: 5, name: 'Dm', label: '柔和 · D 小调', frets: [-1, -1, 0, 2, 3, 1], midi: [50, 57, 62, 65] },
];

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
function jointCosine(a, b, c) {
  const u = [a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0)];
  const v = [c.x - b.x, c.y - b.y, (c.z ?? 0) - (b.z ?? 0)];
  return u.reduce((sum, n, i) => sum + n * v[i], 0) / (Math.hypot(...u) * Math.hypot(...v) || 1);
}

// Simple one-to-five gestures: 1=index; 2=index+middle; 3=+ring;
// 4=four non-thumb fingers; 5=open palm. This deliberately excludes ambiguous shapes.
export function classifyGesture(points) {
  if (!points || points.length !== 21 || points.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || (p.z != null && !Number.isFinite(p.z)))) return null;
  const palm = distance(points[0], points[9]);
  if (palm < 0.025) return null;
  const fingers = [5, 9, 13, 17].map(mcp => {
    const pip = mcp + 1, dip = mcp + 2, tip = mcp + 3;
    return jointCosine(points[mcp], points[pip], points[tip]) < -0.68
      && jointCosine(points[pip], points[dip], points[tip]) < -0.55
      && distance(points[tip], points[0]) > distance(points[pip], points[0]) * 1.12;
  });
  const thumb = jointCosine(points[2], points[3], points[4]) < -0.65
    && distance(points[4], points[5]) > palm * 0.65
    && distance(points[4], points[17]) > distance(points[3], points[17]) * 1.08;
  const pattern = fingers.map(Number).join('');
  if (pattern === '0000' && !thumb) return 0;
  if (pattern === '1000') return 1;
  if (pattern === '1100') return 2;
  if (pattern === '1110') return 3;
  if (pattern === '1111') return thumb ? 5 : 4;
  return null;
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
