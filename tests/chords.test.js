import test from 'node:test';
import assert from 'node:assert/strict';
import { CHORD_CATALOG, CHORD_BY_ID, QUALITIES, GESTURES, TUNING, mappedChord } from '../src/chords.js';
import { defaultPresets, validatePresets, loadPresets, savePresets, STORAGE_KEY } from '../src/presets.js';

test('all 192 catalog entries have correct notes and six-string guitar voicings', () => {
  assert.equal(CHORD_CATALOG.length, 192); assert.equal(CHORD_BY_ID.size, 192); assert.equal(QUALITIES.length, 16);
  for (const chord of CHORD_CATALOG) {
    assert.equal(chord.frets.length, 6, chord.id);
    assert.ok(chord.frets.every(f => Number.isInteger(f) && f >= -1 && f <= 15), chord.id);
    const stopped = chord.frets.filter(f => f > 0);
    assert.ok(!stopped.length || Math.max(...stopped) - Math.min(...stopped) <= 3, chord.id);
    assert.deepEqual(chord.midi, chord.frets.flatMap((f, i) => f < 0 ? [] : [TUNING[i] + f]));
    const expected = [...new Set(chord.intervals.map(i => (chord.pitchClass + i) % 12))].sort((a,b) => a-b);
    const actual = [...new Set(chord.midi.map(n => n % 12))].sort((a,b) => a-b);
    assert.deepEqual(actual, expected, chord.id);
    assert.ok(chord.midi.length >= 3 && chord.midi.length <= 6);
  }
  assert.deepEqual(CHORD_BY_ID.get('C:maj7').intervals, [0,4,7,11]);
  assert.deepEqual(CHORD_BY_ID.get('G:9').intervals, [0,4,7,10,14]);
  assert.deepEqual(CHORD_BY_ID.get('B:m7b5').intervals, [0,3,6,10]);
});
test('twelve unique gestures and defaults retain the original five chords', () => {
  assert.equal(GESTURES.length, 12); assert.equal(new Set(GESTURES.map(g => g.mask)).size, 12);
  const data = defaultPresets(), mapping = data.presets[0].mapping;
  assert.deepEqual([1,2,3,4,5].map(n => mappedChord(mapping, n).name), ['C','G','Am','F','Dm']);
  assert.equal(mappedChord(mapping, 0), null);
  assert.equal(mappedChord(mapping, null), null);
  assert.deepEqual(validatePresets(data), data);
});
test('preset round-trip preserves every song, mapping and active selection', () => {
  const data = defaultPresets(); data.activeId = 'jazz'; data.presets[2].mapping[12] = 'F#:m9';
  const storage = { value: null, getItem(key) { assert.equal(key, STORAGE_KEY); return this.value; }, setItem(key, value) { assert.equal(key, STORAGE_KEY); this.value = value; } };
  savePresets(storage, data); assert.deepEqual(loadPresets(storage), { data, warning: '' });
  assert.equal(mappedChord(loadPresets(storage).data.presets[2].mapping, 12).name, 'F#m9');
});
test('malformed imports cannot replace working presets', () => {
  for (const mutate of [
    d => { d.version = 2; }, d => { d.activeId = 'missing'; }, d => { d.presets = []; },
    d => { d.presets[0].mapping[1] = 'C:fake'; }, d => { delete d.presets[0].mapping[12]; },
    d => { d.presets[1].id = d.presets[0].id; }, d => { d.presets[0].name = ' '; },
    d => { d.presets[0].name = 'a'.repeat(61); }, d => { d.presets = Array(101).fill(d.presets[0]); },
  ]) { const data = defaultPresets(); mutate(data); assert.throws(() => validatePresets(data)); }
});
test('broken or unavailable local storage loads defaults and reports the problem', () => {
  assert.ok(loadPresets({ getItem() { throw new Error('denied'); } }).warning);
  assert.ok(loadPresets({ getItem() { return '{broken'; } }).warning);
  assert.ok(loadPresets({ getItem() { return '{}'; } }).warning);
  assert.equal(loadPresets({ getItem() { return null; } }).warning, '');
  assert.throws(() => savePresets({ setItem() { throw new Error('quota'); } }, defaultPresets()));
});
