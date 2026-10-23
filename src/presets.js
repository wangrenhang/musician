import { GESTURES, DEFAULT_MAPPING, CHORD_BY_ID } from './chords.js';
export const STORAGE_KEY = 'air-strum.presets.v1';
export function defaultPresets() {
  return { version: 1, activeId: 'default', presets: [
    { id: 'default', name: '常用和弦', mapping: { ...DEFAULT_MAPPING } },
    { id: 'pop', name: '流行 · C–G–Am–F', mapping: { ...DEFAULT_MAPPING, 1: 'C:major', 2: 'G:major', 3: 'A:minor', 4: 'F:major', 5: 'D:minor', 6: 'E:minor', 7: 'C:maj7', 8: 'F:maj7', 9: 'G:sus4', 10: 'A:m7', 11: 'D:m7', 12: 'G:7' } },
    { id: 'jazz', name: '七和弦 · ii–V–I', mapping: { ...DEFAULT_MAPPING, 1: 'D:m7', 2: 'G:7', 3: 'C:maj7', 4: 'A:m7', 5: 'B:m7b5', 6: 'E:7', 7: 'F:maj7', 8: 'C:6', 9: 'D:m9', 10: 'G:9', 11: 'C:add9', 12: 'A:m6' } },
  ] };
}
export function validatePresets(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.presets) || value.presets.length < 1 || value.presets.length > 100) throw new Error('预设文件格式不正确，需包含 1–100 套预设。');
  const ids = new Set();
  const presets = value.presets.map(p => {
    if (!p || typeof p.id !== 'string' || !p.id || p.id.length > 100 || ids.has(p.id) || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 60 || !p.mapping) throw new Error('预设名称或编号无效。');
    ids.add(p.id);
    const mapping = Object.fromEntries(GESTURES.map(g => {
      const id = p.mapping[g.number];
      if (!CHORD_BY_ID.has(id)) throw new Error(`手势 ${g.number} 的和弦无效。`);
      return [g.number, id];
    }));
    return { id: p.id, name: p.name.trim(), mapping };
  });
  if (!ids.has(value.activeId)) throw new Error('当前预设不存在。');
  return { version: 1, activeId: value.activeId, presets };
}
export function loadPresets(storage) {
  try { const raw = storage.getItem(STORAGE_KEY); return { data: raw ? validatePresets(JSON.parse(raw)) : defaultPresets(), warning: '' }; }
  catch { return { data: defaultPresets(), warning: '无法读取本机预设，已加载默认设置；可导入之前导出的备份。' }; }
}
export function savePresets(storage, value) {
  storage.setItem(STORAGE_KEY, JSON.stringify(validatePresets(value)));
}
