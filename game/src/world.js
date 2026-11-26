// The world: one island in a big ocean — a dome of green hills, a rocky ridge in the north,
// a flat west plateau carrying Runway 36, a harbour town on the east shore and a lighthouse
// point in the south-east. The terrain height is an analytic function (dome + gaussian hills
// + plateau blend + gentle sine noise), so the renderer, the flight model's ground collision
// and the ring course all sample exactly the same ground.

import { ISLAND, RUNWAY, WORLD } from './config.js';
import { mulberry32, range } from './random.js';

/** Hills of the northern ridge: x, z, height, spread. Kept clear of the ring course. */
const HILLS = [
  { x: 150, z: -950, h: 300, s: 430 },
  { x: 1050, z: -1050, h: 210, s: 380 },
  { x: -1050, z: 150, h: 170, s: 340 },
];

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Distance from (x, z) to the runway rectangle (0 when over the strip). */
export function runwayDistance(x, z) {
  const dx = Math.max(Math.abs(x - RUNWAY.centreX) - RUNWAY.width / 2, 0);
  const dz = Math.max(Math.abs(z - RUNWAY.centreZ) - RUNWAY.length / 2, 0);
  return Math.hypot(dx, dz);
}

/** True when (x, z) is over the runway strip itself. */
export function overRunway(x, z) {
  return Math.abs(x - RUNWAY.centreX) <= RUNWAY.width / 2
    && Math.abs(z - RUNWAY.centreZ) <= RUNWAY.length / 2;
}

/**
 * Ground height in metres at (x, z). Underwater it falls to a sandy floor; the airfield
 * plateau is blended flat so the runway sits level.
 */
export function terrainHeight(x, z) {
  const dx = x - ISLAND.centreX;
  const dz = z - ISLAND.centreZ;
  const d = Math.hypot(dx, dz);
  const dome = ISLAND.domeHeight * Math.max(0, 1 - (d / ISLAND.radius) ** 2) ** 1.35;
  let hills = 0;
  for (const hill of HILLS) {
    const hd = Math.hypot(x - hill.x, z - hill.z);
    hills += hill.h * Math.exp(-(hd * hd) / (2 * hill.s * hill.s));
  }
  const shore = smoothstep(ISLAND.radius * 1.04, ISLAND.radius * 0.82, d);
  let height = -9 + shore * (9 + dome + hills);
  height += Math.sin(x * 0.004 + z * 0.0017) * 2.2 + Math.sin(z * 0.006 - x * 0.0023) * 1.7;
  if (height < 2) height = Math.min(height, 1.2 + (height + 9) * 0.05);
  const blend = 1 - smoothstep(0, 300, runwayDistance(x, z));
  return height * (1 - blend) + RUNWAY.plateauHeight * blend;
}

/** Terrain colour by height and slope, the palette the renderer shades from. */
export function terrainColor(height, slope) {
  if (height < 0.4) return [194, 178, 128]; // sea floor sand
  if (height < 2.4) return [217, 194, 138]; // beach
  if (slope > 0.62) return [133, 126, 114]; // bare rock on steep faces
  if (height > 248) return [238, 242, 245]; // snow on the high ridge
  if (height > 165) return [146, 140, 126]; // high scrub
  return [86, 148, 74]; // lowland green
}

/** A forest tint patch test: darker green where the low-frequency noise says trees. */
export function isForest(x, z, height) {
  if (height < 3 || height > 150) return false;
  return Math.sin(x * 0.011 + 4.1) * Math.sin(z * 0.009 - 2.3) > 0.25;
}

/**
 * The ring course: eight gates on a clockwise circuit of the island, each facing along the
 * path to the next, the last one lining the pilot up for the downwind into Runway 36.
 */
export const RINGS = [
  { x: -650, y: 128, z: -480 },
  { x: -450, y: 190, z: -1050 },
  { x: 620, y: 225, z: -1280 },
  { x: 1280, y: 195, z: -520 },
  { x: 1380, y: 160, z: 420 },
  { x: 820, y: 140, z: 1180 },
  { x: 20, y: 128, z: 1380 },
  { x: -700, y: 116, z: 920 },
];

/** Unit normal each ring faces: the direction of travel through it. */
export function ringNormal(index) {
  const here = RINGS[index];
  const next = RINGS[(index + 1) % RINGS.length];
  const vx = next.x - here.x;
  const vz = next.z - here.z;
  const len = Math.hypot(vx, vz) || 1;
  return { x: vx / len, z: vz / len };
}

/** Buildings of the harbour town: seeded boxes on the east shore's flat ground. */
export function buildTown() {
  const next = mulberry32(20261126);
  const buildings = [];
  for (let i = 0; i < 110; i += 1) {
    const x = 620 + next() * 620;
    const z = 380 + next() * 720;
    const ground = terrainHeight(x, z);
    if (ground < 4 || ground > 60) continue;
    if (runwayDistance(x, z) < 120) continue;
    const w = range(next, 14, 30);
    const d = range(next, 14, 30);
    const h = range(next, 9, 42);
    const tone = range(next, 0.82, 1.08);
    buildings.push({ x, z, ground, w, d, h, tone, roof: next() > 0.5 });
  }
  return buildings;
}

/** The control tower and hangars beside the runway. */
export const AIRFIELD_BUILDINGS = [
  { x: -520, z: 120, w: 26, d: 26, h: 34, tower: true },
  { x: -520, z: 220, w: 54, d: 30, h: 13, tower: false },
  { x: -525, z: 300, w: 44, d: 26, h: 11, tower: false },
  { x: -540, z: 700, w: 60, d: 34, h: 14, tower: false },
];

/** The lighthouse on the south-east point: position and ground height. */
export const LIGHTHOUSE = { x: 1520, z: 1290, h: 26 };

/** Clouds: soft clusters drifting high above the island, seeded once. */
export function buildClouds() {
  const next = mulberry32(777);
  const clouds = [];
  for (let i = 0; i < 34; i += 1) {
    clouds.push({
      x: range(next, -2300, 2300),
      y: range(next, 380, 540),
      z: range(next, -2300, 2300),
      r: range(next, 90, 210),
      puffs: 3 + Math.floor(next() * 3),
      seed: next() * 10,
    });
  }
  return clouds;
}

/** Pre-built world dressing, created once per game. */
export function buildWorld() {
  return {
    buildings: buildTown(),
    clouds: buildClouds(),
    worldSize: WORLD.size,
  };
}
