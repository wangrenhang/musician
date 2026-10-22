import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyGesture, GestureLatch, StrumDetector, assignHands, palmCenter, CHORDS } from '../src/gestures.js';

import { hand, pose } from './fixtures/hand.js';

test('classifies fist and all five specified number gestures', () => {
  for (let n = 0; n <= 5; n++) assert.equal(classifyGesture(hand(n)), n, `gesture ${n}`);
});
test('classification survives in-plane rotation, mirroring and different hand sizes', () => {
  for (let n = 0; n <= 5; n++) for (const angle of [-1.1, -0.3, 0.7, 1.8]) for (const scale of [0.5, 0.85, 1.1]) {
    const rotated = hand(n).map(p => ({ x: 0.5 + scale * ((p.x - 0.5) * Math.cos(angle) - (p.y - 0.5) * Math.sin(angle)), y: 0.4 + scale * ((p.x - 0.5) * Math.sin(angle) + (p.y - 0.5) * Math.cos(angle)), z: 0 }));
    assert.equal(classifyGesture(rotated), n);
    assert.equal(classifyGesture(rotated.map(p => ({ ...p, x: 1 - p.x }))), n);
  }
});
test('metric landmarks recognize palm and back views despite perspective and image aspect', () => {
  for (let n = 0; n <= 5; n++) for (const yaw of [0, 55, 125, 180]) for (const pitch of [-35, 25]) for (const roll of [0, 65, 110]) for (const aspect of [0.56, 1.6, 2.4]) {
    const sample = pose(n, { yaw, pitch, roll, aspect });
    assert.equal(classifyGesture(sample.landmarks, sample.worldLandmarks), n, JSON.stringify({ n, yaw, pitch, roll, aspect }));
  }
});
test('corrupt metric coordinates cannot trigger a chord', () => {
  const sample = pose(1);
  sample.worldLandmarks[8].z = NaN;
  assert.equal(classifyGesture(sample.landmarks, sample.worldLandmarks), null);
  assert.equal(classifyGesture(hand(1), Array(21).fill({ x: 0, y: 0, z: 0 })), null);
});
test('rejects malformed, tiny and unsupported finger patterns', () => {
  assert.equal(classifyGesture(null), null); assert.equal(classifyGesture([]), null);
  const invalid = hand(1); invalid[8].x = NaN; assert.equal(classifyGesture(invalid), null);
  assert.equal(classifyGesture(hand(1).map(p => ({ x: p.x * 0.01, y: p.y * 0.01 }))), null);
  const unsupported = hand(0); const extended = hand(4); for (let i = 17; i <= 20; i++) unsupported[i] = extended[i];
  assert.equal(classifyGesture(unsupported), null);
});
test('gesture latch ignores one-frame noise and switches after dwell', () => {
  const latch = new GestureLatch();
  for (let t = 0; t <= 90; t += 30) assert.equal(latch.update(1, t), null);
  assert.equal(latch.update(1, 120), 1);
  assert.equal(latch.update(2, 150), 1); assert.equal(latch.update(1, 180), 1);
  for (let t = 210; t <= 300; t += 30) assert.equal(latch.update(3, t), 1);
  assert.equal(latch.update(3, 330), 3);
  for (let t = 360; t <= 480; t += 30) latch.update(0, t);
  assert.equal(latch.value, 0);
});
test('lost hand releases the chord; stalled frames do not satisfy dwell', () => {
  const latch = new GestureLatch(); latch.update(1, 0); assert.equal(latch.update(1, 500), null);
  latch.update(1, 530); latch.update(1, 560); latch.update(1, 590); assert.equal(latch.update(1, 620), 1);
  assert.equal(latch.update(null, 800), 1); assert.equal(latch.update(null, 1100), null);
});
test('strumming detects one downstroke and one upstroke per pass', () => {
  const detector = new StrumDetector(); const hits = [];
  [0.3,0.36,0.45,0.59,0.7,0.75,0.72,0.64,0.51,0.38,0.3].forEach((y, i) => { const hit = detector.update(y, i * 33); if (hit) hits.push(hit); });
  assert.deepEqual(hits.map(h => h.direction), ['down', 'up']);
  assert.ok(hits.every(h => h.velocity >= 0.25 && h.velocity <= 1));
});
test('stationary jitter and slow line crossings do not strum', () => {
  const detector = new StrumDetector(); detector.update(0.3, 0);
  for (let i = 1; i <= 130; i++) assert.equal(detector.update(0.3 + i * 0.003, i * 33), null);
  detector.reset();
  for (let i = 0; i < 100; i++) assert.equal(detector.update(0.55 + Math.sin(i) * 0.012, i * 33), null);
});
test('tracking loss, device stalls and timestamp reversal do not strum', () => {
  const detector = new StrumDetector(); detector.update(0.3, 0);
  assert.equal(detector.update(null, 33), null); assert.equal(detector.update(0.8, 66), null);
  assert.equal(detector.update(0.3, 500), null); assert.equal(detector.update(0.8, 400), null);
});
test('sensitivity lowers minimum movement speed', () => {
  const run = sensitivity => {
    const detector = new StrumDetector({ sensitivity }); const hits = [];
    for (let i = 0; i <= 20; i++) { const hit = detector.update(0.3 + i * 0.022, i * 33); if (hit) hits.push(hit); }
    return hits;
  };
  assert.equal(run(10).length, 0); assert.equal(run(90).length, 1);
});
test('handedness assignment respects confidence, role swapping and duplicate labels', () => {
  const left = hand(1), right = hand(0);
  const result = { landmarks: [left, right], handedness: [[{ categoryName: 'Left', score: 0.95 }], [{ categoryName: 'Right', score: 0.9 }]] };
  assert.deepEqual(assignHands(result), { chord: left, strum: right });
  assert.deepEqual(assignHands(result, true), { chord: right, strum: left });
  result.handedness[1][0].score = 0.4; assert.equal(assignHands(result).strum, null);
  result.handedness[1][0] = { categoryName: 'Left', score: 0.8 };
  assert.equal(assignHands(result).chord, left); assert.equal(assignHands(result).strum, null);
});
test('palm center and chord table contain valid data', () => {
  const center = palmCenter(hand(5)); assert.ok(center.y > 0.55 && center.y < 0.8);
  assert.deepEqual(CHORDS.map(c => c.name), ['C','G','Am','F','Dm']);
  assert.ok(CHORDS.every(c => c.midi.length === c.frets.filter(f => f >= 0).length));
});
