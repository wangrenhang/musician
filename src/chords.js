export const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const QUALITIES = [
  { id: 'major', suffix: '', label: '大三和弦', intervals: [0, 4, 7] },
  { id: 'minor', suffix: 'm', label: '小三和弦', intervals: [0, 3, 7] },
  { id: '7', suffix: '7', label: '属七和弦', intervals: [0, 4, 7, 10] },
  { id: 'maj7', suffix: 'maj7', label: '大七和弦', intervals: [0, 4, 7, 11] },
  { id: 'm7', suffix: 'm7', label: '小七和弦', intervals: [0, 3, 7, 10] },
  { id: 'sus2', suffix: 'sus2', label: '挂二和弦', intervals: [0, 2, 7] },
  { id: 'sus4', suffix: 'sus4', label: '挂四和弦', intervals: [0, 5, 7] },
  { id: 'add9', suffix: 'add9', label: '加九和弦', intervals: [0, 4, 7, 14] },
  { id: '6', suffix: '6', label: '大六和弦', intervals: [0, 4, 7, 9] },
  { id: 'm6', suffix: 'm6', label: '小六和弦', intervals: [0, 3, 7, 9] },
  { id: 'dim', suffix: 'dim', label: '减三和弦', intervals: [0, 3, 6] },
  { id: 'dim7', suffix: 'dim7', label: '减七和弦', intervals: [0, 3, 6, 9] },
  { id: 'aug', suffix: 'aug', label: '增三和弦', intervals: [0, 4, 8] },
  { id: 'm7b5', suffix: 'm7♭5', label: '半减七和弦', intervals: [0, 3, 6, 10] },
  { id: '9', suffix: '9', label: '属九和弦', intervals: [0, 4, 7, 10, 14] },
  { id: 'm9', suffix: 'm9', label: '小九和弦', intervals: [0, 3, 7, 10, 14] },
];
export const TUNING = [40, 45, 50, 55, 59, 64];
const OPEN_SHAPES = { C: [-1,3,2,0,1,0], G: [3,2,0,0,0,3], Am: [-1,0,2,2,1,0], F: [1,3,3,2,1,1], Dm: [-1,-1,0,2,3,1], Em: [0,2,2,0,0,0], D: [-1,-1,0,2,3,2], A: [-1,0,2,2,2,0], E: [0,2,2,1,0,0] };

// Search actual six-string guitar voicings. All chord tones must be present;
// no non-chord tones, at most four frets of stopped-finger span, frets 0–15.
function guitarVoicing(root, intervals) {
  const required = [...new Set(intervals.map(n => (root + n) % 12))];
  const full = (1 << required.length) - 1;
  let best = null, bestScore = Infinity;
  for (let start = 1; start <= 12; start++) {
    const choices = TUNING.map(open => [-1, 0, start, start + 1, start + 2, start + 3]
      .filter((f, i, list) => list.indexOf(f) === i && (f < 0 || required.includes((open + f) % 12))));
    function search(string, frets, mask, sounding, firstPitch, sum) {
      if (required.length - countBits(mask) > 6 - string) return;
      if (string === 6) {
        if (mask !== full || sounding < 3) return;
        const stopped = frets.filter(f => f > 0);
        const span = stopped.length ? Math.max(...stopped) - Math.min(...stopped) : 0;
        const score = (firstPitch % 12 === root ? 0 : 18) + (6 - sounding) * 6 + sum * 0.55 + span * 2 + (stopped.length ? Math.min(...stopped) : 0);
        if (score < bestScore) { bestScore = score; best = [...frets]; }
        return;
      }
      for (const fret of choices[string]) {
        const pitch = TUNING[string] + fret;
        search(string + 1, [...frets, fret], fret < 0 ? mask : mask | (1 << required.indexOf(pitch % 12)), sounding + (fret >= 0 ? 1 : 0), firstPitch ?? (fret >= 0 ? pitch : null), sum + Math.max(0, fret));
      }
    }
    search(0, [], 0, 0, null, 0);
  }
  if (!best) throw new Error(`No guitar voicing for ${root}:${intervals}`);
  return best;
}
function countBits(n) { let count = 0; while (n) { n &= n - 1; count++; } return count; }

export const CHORD_CATALOG = ROOTS.flatMap((root, pitchClass) => QUALITIES.map(quality => {
  const name = `${root}${quality.suffix}`;
  const frets = OPEN_SHAPES[name] ?? guitarVoicing(pitchClass, quality.intervals);
  return { id: `${root}:${quality.id}`, name, label: `${root} · ${quality.label}`, root, pitchClass, quality: quality.id, intervals: quality.intervals, frets, midi: frets.flatMap((f, i) => f < 0 ? [] : [TUNING[i] + f]) };
}));
export const CHORD_BY_ID = new Map(CHORD_CATALOG.map(c => [c.id, c]));

// Bit order: thumb, index, middle, ring, pinky. Choose twelve comparatively
// familiar shapes rather than requiring every one of the theoretical 32.
export const GESTURES = [
  { number: 1, mask: 2, label: '食指', defaultChord: 'C:major' },
  { number: 2, mask: 6, label: '食指 + 中指', defaultChord: 'G:major' },
  { number: 3, mask: 14, label: '食指 + 中指 + 无名指', defaultChord: 'A:minor' },
  { number: 4, mask: 30, label: '四指 · 拇指收起', defaultChord: 'F:major' },
  { number: 5, mask: 31, label: '五指张开', defaultChord: 'D:minor' },
  { number: 6, mask: 1, label: '只伸拇指', defaultChord: 'E:minor' },
  { number: 7, mask: 16, label: '只伸小指', defaultChord: 'D:major' },
  { number: 8, mask: 18, label: '食指 + 小指', defaultChord: 'A:major' },
  { number: 9, mask: 3, label: '拇指 + 食指（L）', defaultChord: 'E:major' },
  { number: 10, mask: 7, label: '拇指 + 食指 + 中指', defaultChord: 'B:minor' },
  { number: 11, mask: 17, label: '拇指 + 小指（六）', defaultChord: 'C:7' },
  { number: 12, mask: 19, label: '拇指 + 食指 + 小指', defaultChord: 'G:7' },
];
export const DEFAULT_MAPPING = Object.fromEntries(GESTURES.map(g => [g.number, g.defaultChord]));
export const CHORDS = GESTURES.map(g => ({ ...CHORD_BY_ID.get(g.defaultChord), number: g.number }));
export function mappedChord(mapping, number) { return CHORD_BY_ID.get(mapping[number]) ?? null; }
