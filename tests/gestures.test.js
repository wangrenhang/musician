import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyGesture, GestureLatch, StrumDetector, assignHands, palmCenter, CHORDS } from '../src/gestures.js';

import { hand, pose } from './fixtures/hand.js';

test('classifies fist and all twelve configured gestures', () => {
  for (let n = 0; n <= 12; n++) assert.equal(classifyGesture(hand(n)), n, `gesture ${n}`);
});
test('classification survives in-plane rotation, mirroring and different hand sizes', () => {
  for (let n = 0; n <= 12; n++) for (const angle of [-1.1, -0.3, 0.7, 1.8]) for (const scale of [0.5, 0.85, 1.1]) {
    const rotated = hand(n).map(p => ({ x: 0.5 + scale * ((p.x - 0.5) * Math.cos(angle) - (p.y - 0.5) * Math.sin(angle)), y: 0.4 + scale * ((p.x - 0.5) * Math.sin(angle) + (p.y - 0.5) * Math.cos(angle)), z: 0 }));
    assert.equal(classifyGesture(rotated), n);
    assert.equal(classifyGesture(rotated.map(p => ({ ...p, x: 1 - p.x }))), n);
  }
});
test('metric landmarks recognize palm and back views despite perspective and image aspect', () => {
  for (let n = 0; n <= 12; n++) for (const yaw of [0, 55, 125, 180]) for (const pitch of [-35, 25]) for (const roll of [0, 65, 110]) for (const aspect of [0.56, 1.6, 2.4]) {
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
  const unsupported = hand(0); const extended = hand(4); for (let i = 13; i <= 16; i++) unsupported[i] = extended[i];
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
test('stationary jitter and slow repositioning do not strum', () => {
  const detector = new StrumDetector(); detector.update(0.3, 0);
  for (let i = 1; i <= 130; i++) assert.equal(detector.update(0.3 + i * 0.003, i * 33), null);
  detector.reset();
  for (let i = 0; i < 100; i++) assert.equal(detector.update(0.55 + Math.sin(i) * 0.012, i * 33), null);
});
test('short tracking gaps preserve a swing without repeating the hit', () => {
  const detector = new StrumDetector(); detector.update(0.3, 0);
  assert.equal(detector.update(null, 33), null);
  assert.equal(detector.update(0.8, 66)?.direction, 'down');
  assert.equal(detector.update(0.8, 99), null);
  assert.equal(detector.update(null, 132), null);
  assert.equal(detector.update(0.3, 165)?.direction, 'up');
});

test('extended tracking loss, device stalls and timestamp reversal do not strum', () => {
  const detector = new StrumDetector(); detector.update(0.3, 0);
  assert.equal(detector.update(null, 33), null); assert.equal(detector.update(0.8, 150), null);
  assert.equal(detector.update(0.3, 500), null); assert.equal(detector.update(0.8, 400), null);
  detector.update(null, 550);
  assert.equal(detector.update(0.3, 580), null);
});

test('fast alternating strokes are detected at 30 and 60 FPS', () => {
  for (const fps of [30, 60]) {
    const detector = new StrumDetector(); const hits = [];
    // One direction every ~67ms, quicker than the old fixed 115ms cooldown.
    for (let i = 0; i <= fps; i++) {
      const y = Math.floor(i / (fps / 15)) % 2 ? 0.72 : 0.38;
      const hit = detector.update(y, i * 1000 / fps);
      if (hit) hits.push(hit.direction);
    }
    assert.deepEqual(hits, Array.from({ length: 15 }, (_, i) => i % 2 ? 'up' : 'down'), `${fps} FPS`);
  }
});

test('high sensitivity captures a brief small stroke', () => {
  const detector = new StrumDetector({ sensitivity: 90 });
  detector.update(0.52, 0);
  assert.equal(detector.update(0.56, 1000 / 60)?.direction, 'down');
  assert.equal(detector.update(0.52, 2000 / 60), null);
});

test('high sensitivity reduces required excursion while rejecting jitter', () => {
  const run = sensitivity => {
    const detector = new StrumDetector({ sensitivity }); const hits = [];
    for (let i = 0; i < 9; i++) {
      const hit = detector.update(i % 2 ? 0.58 : 0.52, i * 66);
      if (hit) hits.push(hit);
    }
    return hits;
  };
  assert.equal(run(90).length, 8); assert.equal(run(10).length, 0);
  const detector = new StrumDetector({ sensitivity: 90 });
  for (let i = 0; i < 100; i++) assert.equal(detector.update(0.55 + Math.sin(i) * 0.012, i * 16.7), null);
});
test('sensitivity lowers minimum movement speed', () => {
  const run = sensitivity => {
    const detector = new StrumDetector({ sensitivity }); const hits = [];
    for (let i = 0; i <= 20; i++) { const hit = detector.update(0.3 + i * 0.022, i * 33); if (hit) hits.push(hit); }
    return hits;
  };
  assert.equal(run(10).length, 0); assert.equal(run(90).length, 1);
});

test('swing detection works at different positions without crossing a fixed line', () => {
  for (const startY of [0.1, 0.3, 0.65, 0.82]) {
    const detector = new StrumDetector(); const hits = [];
    [0, 0.03, 0.07, 0.1, 0.07, 0.03, 0].forEach((offset, i) => {
      const hit = detector.update({ x: 0.3, y: startY + offset }, i * 33);
      if (hit) hits.push(hit.direction);
    });
    assert.deepEqual(hits, ['down', 'up'], `start ${startY}`);
  }
});

test('horizontal and diagonal swings play one stroke in each direction', () => {
  for (const [dx, dy] of [[-0.1, 0], [-0.05, 0.08], [0.05, 0.08]]) {
    const detector = new StrumDetector(); const hits = [];
    [0, 0.5, 1, 0.5, 0].forEach((fraction, i) => {
      const hit = detector.update({ x: 0.4 + dx * fraction, y: 0.2 + dy * fraction }, i * 50);
      if (hit) hits.push(hit.direction);
    });
    assert.deepEqual(hits, ['down', 'up']);
  }
});

test('a long uninterrupted swing plays once and a pause permits another in the same direction', () => {
  const detector = new StrumDetector(); const hits = [];
  for (let i = 0; i <= 15; i++) {
    const hit = detector.update(0.1 + i * 0.04, i * 33);
    if (hit) hits.push(hit);
  }
  assert.equal(hits.length, 1);
  for (let i = 16; i <= 21; i++) assert.equal(detector.update(0.7, i * 33), null);
  assert.equal(detector.update(0.8, 22 * 33)?.direction, 'down');
});

test('small reverse jitter after a stroke does not rearm it', () => {
  const detector = new StrumDetector({ sensitivity: 90 });
  detector.update({ x: 0.3, y: 0.1 }, 0);
  assert.equal(detector.update({ x: 0.3, y: 0.2 }, 50)?.direction, 'down');
  for (let i = 1; i <= 90; i++) {
    assert.equal(detector.update({ x: 0.3 + Math.sin(i) * 0.006, y: 0.2 + Math.cos(i) * 0.006 }, 50 + i * 17), null);
  }
});

test('slow repositioning does not prevent the next fast swing', () => {
  const detector = new StrumDetector(); detector.update(0.2, 0);
  assert.equal(detector.update(0.4, 50)?.direction, 'down');
  for (let i = 1; i <= 30; i++) assert.equal(detector.update(0.4 - i * 0.002, 50 + i * 33), null);
  assert.equal(detector.update(0.24, 50 + 31 * 33)?.direction, 'up');
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
  assert.deepEqual(CHORDS.map(c => c.name), ['C','G','Am','F','Dm','Em','D','A','E','Bm','C7','G7']);
  assert.ok(CHORDS.every(c => c.midi.length === c.frets.filter(f => f >= 0).length));
});
