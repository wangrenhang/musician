export function hand(number) {
  const points = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.7, z: 0 }));
  points[0] = { x: 0.5, y: 0.85, z: 0 };
  points[1] = { x: 0.43, y: 0.78, z: 0 };
  points[2] = { x: 0.4, y: 0.72, z: 0 };
  points[3] = { x: number === 5 ? 0.31 : 0.44, y: number === 5 ? 0.65 : 0.67, z: 0 };
  points[4] = { x: number === 5 ? 0.22 : 0.48, y: number === 5 ? 0.58 : 0.69, z: 0 };
  [5, 9, 13, 17].forEach((mcp, i) => {
    const x = 0.42 + i * 0.08, y = i === 1 ? 0.55 : 0.60 + (i === 3 ? 0.05 : 0);
    const extended = i < Math.min(number, 4);
    points[mcp] = { x, y, z: 0 };
    points[mcp + 1] = { x, y: y - 0.1, z: 0 };
    points[mcp + 2] = { x, y: y + (extended ? -0.18 : -0.02), z: 0 };
    points[mcp + 3] = { x, y: y + (extended ? -0.25 : 0.03), z: 0 };
  });
  return points;
}

// Geometric fixtures, not recorded hands: rotate metric coordinates then project
// them through a perspective camera with a configurable image aspect ratio.
export function pose(number, { yaw = 180, pitch = 25, roll = 45, aspect = 1.6, centerX = 0.5, centerY = 0.5 } = {}) {
  const [a, b, c] = [yaw, pitch, roll].map(n => n * Math.PI / 180);
  const worldLandmarks = hand(number).map(p => {
    const x = (p.x - 0.5) * 0.25, y = (p.y - 0.7) * 0.25, z = (p.z ?? 0) * 0.25;
    const x1 = x * Math.cos(a) + z * Math.sin(a), z1 = -x * Math.sin(a) + z * Math.cos(a);
    const y2 = y * Math.cos(b) - z1 * Math.sin(b), z2 = y * Math.sin(b) + z1 * Math.cos(b);
    return { x: x1 * Math.cos(c) - y2 * Math.sin(c), y: x1 * Math.sin(c) + y2 * Math.cos(c), z: z2 };
  });
  const landmarks = worldLandmarks.map(p => ({ x: centerX + p.x * 0.9 / ((0.55 + p.z) * aspect), y: centerY + p.y * 0.9 / (0.55 + p.z), z: p.z * 0.9 / (0.55 * aspect) }));
  return { landmarks, worldLandmarks };
}

