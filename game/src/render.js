// The renderer: a small software 3D pipeline on a 2D canvas. The camera chases the
// aeroplane; the world is drawn in painter's order — sky, sea, the island's heightfield
// (flat-shaded, fogged with distance), the runway, buildings and rings, clouds, then the
// aeroplane's own faces — so a frame always shows terrain you can recognise: green lowland,
// a rocky northern ridge, the harbour town, the lighthouse point and Runway 36's plateau.

import { RUNWAY, SKY, WORLD } from './config.js';
import { forwardVector } from './flight.js';
import { AIRFIELD_BUILDINGS, LIGHTHOUSE, RINGS, isForest, ringNormal, terrainColor, terrainHeight } from './world.js';
import { planeFaces } from './plane.js';

const FOV = 1.08; // radians, vertical
const NEAR = 1.6;
const VIEW_DIST = 3600;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mixColor(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function css(color) {
  return `rgb(${color[0]},${color[1]},${color[2]})`;
}

const FOG_RGB = [207, 221, 232];
const SUN = (() => {
  const s = SKY.sunDirection;
  const len = Math.hypot(s.x, s.y, s.z);
  return { x: s.x / len, y: s.y / len, z: s.z / len };
})();

/** Shade a base colour by a face normal: ambient floor plus the sun's contribution. */
function shade(color, nx, ny, nz) {
  const d = Math.max(0, nx * SUN.x + ny * SUN.y + nz * SUN.z);
  const f = 0.58 + 0.5 * d;
  return [Math.min(255, color[0] * f), Math.min(255, color[1] * f), Math.min(255, color[2] * f)];
}

/** Face normal of a world-space polygon (first three points). */
function faceNormal(points) {
  const [a, b, c] = points;
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

// --- Terrain mesh, built once: heights and statically shaded quad colours. ---------------

const GRID_N = WORLD.gridN;
const GRID_STEP = WORLD.gridStep;
const GRID_HALF = (GRID_N - 1) * GRID_STEP / 2;

const terrainQuads = (() => {
  const heights = [];
  for (let j = 0; j < GRID_N; j += 1) {
    heights.push([]);
    for (let i = 0; i < GRID_N; i += 1) {
      heights[j].push(terrainHeight(-GRID_HALF + i * GRID_STEP, -GRID_HALF + j * GRID_STEP));
    }
  }
  const quads = [];
  for (let j = 0; j < GRID_N - 1; j += 1) {
    for (let i = 0; i < GRID_N - 1; i += 1) {
      const x0 = -GRID_HALF + i * GRID_STEP;
      const z0 = -GRID_HALF + j * GRID_STEP;
      const x1 = x0 + GRID_STEP;
      const z1 = z0 + GRID_STEP;
      const points = [
        [x0, heights[j][i], z0],
        [x1, heights[j][i + 1], z0],
        [x1, heights[j + 1][i + 1], z1],
        [x0, heights[j + 1][i], z1],
      ];
      const centreHeight = (points[0][1] + points[2][1]) / 2;
      const slope = Math.min(1, Math.abs(points[2][1] - points[0][1]) / GRID_STEP + Math.abs(points[1][1] - points[3][1]) / GRID_STEP);
      let color = terrainColor(centreHeight, slope);
      if (isForest(x0 + GRID_STEP / 2, z0 + GRID_STEP / 2, centreHeight)) color = [47, 104, 52];
      const n = faceNormal(points);
      quads.push({ points, color: shade(color, n[0], n[1], n[2]), cx: x0 + GRID_STEP / 2, cz: z0 + GRID_STEP / 2 });
    }
  }
  return quads;
})();

// --- Camera --------------------------------------------------------------------------------

/** A chase camera with a little lag, so the aeroplane moves in frame when it manoeuvres. */
export function createCamera() {
  return { pos: null, target: null };
}

export function updateCamera(camera, plane, dt, snap) {
  const fwd = forwardVector(plane.heading, plane.pitch);
  const up = { x: 0, y: 1, z: 0 };
  const wantedPos = {
    x: plane.x - fwd.x * 30 + up.x * 10 - fwd.y * 6,
    y: plane.y - fwd.y * 30 + 10,
    z: plane.z - fwd.z * 30 + up.z * 10,
  };
  // The camera never dips below the ground it flies over.
  wantedPos.y = Math.max(wantedPos.y, terrainHeight(wantedPos.x, wantedPos.z) + 3.2);
  const wantedTarget = {
    x: plane.x + fwd.x * 70,
    y: plane.y + fwd.y * 70 + 1,
    z: plane.z + fwd.z * 70,
  };
  if (snap || camera.pos === null) {
    camera.pos = wantedPos;
    camera.target = wantedTarget;
  } else {
    const k = Math.min(1, dt * 5.5);
    for (const axis of ['x', 'y', 'z']) {
      camera.pos[axis] += (wantedPos[axis] - camera.pos[axis]) * k;
      camera.target[axis] += (wantedTarget[axis] - camera.target[axis]) * Math.min(1, dt * 8);
    }
  }
  return camera;
}

/** Build the projector for one frame: world point -> screen point (or null when behind). */
function makeProjector(camera, width, height, plane) {
  const f = {
    x: camera.target.x - camera.pos.x,
    y: camera.target.y - camera.pos.y,
    z: camera.target.z - camera.pos.z,
  };
  const fl = Math.hypot(f.x, f.y, f.z) || 1;
  f.x /= fl; f.y /= fl; f.z /= fl;
  // Camera right from world up, then tilt the frame part-way with the aeroplane's bank so a
  // turn leans the horizon without ever rolling the view all the way over.
  let rx = f.z, ry = 0, rz = -f.x;
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl; ry /= rl; rz /= rl;
  let ux = f.y * rz - f.z * ry;
  let uy = f.z * rx - f.x * rz;
  let uz = f.x * ry - f.y * rx;
  const bank = clamp(plane.roll, -1.1, 1.1) * 0.52;
  const cb = Math.cos(bank), sb = Math.sin(bank);
  const r2 = { x: rx * cb + ux * sb, y: ry * cb + uy * sb, z: rz * cb + uz * sb };
  const u2 = { x: ux * cb - rx * sb, y: uy * cb - ry * sb, z: uz * cb - rz * sb };
  const scale = (height / 2) / Math.tan(FOV / 2);
  return {
    project(p) {
      const dx = p[0] - camera.pos.x;
      const dy = p[1] - camera.pos.y;
      const dz = p[2] - camera.pos.z;
      const cz = dx * f.x + dy * f.y + dz * f.z;
      if (cz < NEAR) return null;
      const cx = dx * r2.x + dy * r2.y + dz * r2.z;
      const cy = dx * u2.x + dy * u2.y + dz * u2.z;
      return { x: width / 2 + (cx * scale) / cz, y: height / 2 - (cy * scale) / cz, depth: cz };
    },
    depthOf(p) {
      return (p[0] - camera.pos.x) * f.x + (p[1] - camera.pos.y) * f.y + (p[2] - camera.pos.z) * f.z;
    },
  };
}

/** Fill one projected polygon; returns false when any corner falls behind the camera. */
function fillPoly(ctx, projector, points, color, fogAmount) {
  const screen = [];
  let depth = 0;
  for (const p of points) {
    const s = projector.project(p);
    if (s === null) return false;
    screen.push(s);
    depth += s.depth;
  }
  depth /= points.length;
  const fogged = fogAmount ? mixColor(color, FOG_RGB, clamp((depth - 650) / 2500, 0, 0.82)) : color;
  ctx.fillStyle = css(fogged);
  ctx.beginPath();
  ctx.moveTo(screen[0].x, screen[0].y);
  for (let i = 1; i < screen.length; i += 1) ctx.lineTo(screen[i].x, screen[i].y);
  ctx.closePath();
  ctx.fill();
  return true;
}

/** A projected circle (for lights and markers): screen centre and radius, or null. */
function projectCircle(ctx, projector, centre, radius) {
  const s = projector.project(centre);
  if (s === null) return null;
  const edge = projector.project([centre[0] + radius, centre[1], centre[2]]);
  const r = edge === null ? radius * 300 / s.depth : Math.abs(edge.x - s.x);
  return { x: s.x, y: s.y, r: Math.max(1.2, r), depth: s.depth };
}

// --- Scene pieces ---------------------------------------------------------------------------

function drawSky(ctx, width, height, projector) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, SKY.top);
  gradient.addColorStop(0.55, SKY.mid);
  gradient.addColorStop(0.78, SKY.horizon);
  gradient.addColorStop(1, SKY.horizon);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  const sun = projector.project([
    projector.camX - 2600, 1500, projector.camZ - 2900,
  ]);
  if (sun !== null) {
    const glow = ctx.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, 190);
    glow.addColorStop(0, 'rgba(255,244,200,0.95)');
    glow.addColorStop(0.25, 'rgba(255,220,150,0.45)');
    glow.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sun.x - 200, sun.y - 200, 400, 400);
  }
}

function drawSea(ctx, projector) {
  const S = 6200;
  const cells = 6;
  const step = (S * 2) / cells;
  const polys = [];
  for (let j = 0; j < cells; j += 1) {
    for (let i = 0; i < cells; i += 1) {
      const x0 = -S + i * step;
      const z0 = -S + j * step;
      const points = [[x0, 0.15, z0], [x0 + step, 0.15, z0], [x0 + step, 0.15, z0 + step], [x0, 0.15, z0 + step]];
      const depth = projector.depthOf([x0 + step / 2, 0, z0 + step / 2]);
      if (depth < -200 || depth > VIEW_DIST + 1600) continue;
      polys.push({ points, depth });
    }
  }
  polys.sort((a, b) => b.depth - a.depth);
  for (const poly of polys) fillPoly(ctx, projector, poly.points, [46, 106, 158], true);
}

function drawTerrain(ctx, projector) {
  const visible = [];
  for (const quad of terrainQuads) {
    const depth = projector.depthOf([quad.cx, quad.points[0][1], quad.cz]);
    if (depth < -160 || depth > VIEW_DIST) continue;
    visible.push({ quad, depth });
  }
  visible.sort((a, b) => b.depth - a.depth);
  for (const { quad } of visible) fillPoly(ctx, projector, quad.points, quad.color, true);
}

function drawRunway(ctx, projector) {
  const y = RUNWAY.plateauHeight + 0.3;
  const hw = RUNWAY.width / 2;
  const hl = RUNWAY.length / 2;
  const cx = RUNWAY.centreX;
  const cz = RUNWAY.centreZ;
  fillPoly(ctx, projector, [[cx - hw, y, cz - hl], [cx + hw, y, cz - hl], [cx + hw, y, cz + hl], [cx - hw, y, cz + hl]], [56, 58, 63], true);
  // Threshold bars and centreline dashes.
  for (let i = 0; i < 8; i += 1) {
    const bx = cx - hw + 4 + i * ((RUNWAY.width - 8) / 8);
    fillPoly(ctx, projector, [[bx, y + 0.05, cz + hl - 26], [bx + 2.6, y + 0.05, cz + hl - 26], [bx + 2.6, y + 0.05, cz + hl - 4], [bx, y + 0.05, cz + hl - 4]], [232, 234, 236], true);
  }
  for (let z = cz - hl + 60; z < cz + hl - 50; z += 64) {
    fillPoly(ctx, projector, [[cx - 1.1, y + 0.05, z], [cx + 1.1, y + 0.05, z], [cx + 1.1, y + 0.05, z + 26], [cx - 1.1, y + 0.05, z + 26]], [228, 230, 232], true);
  }
  // Edge lights: warm dots down both sides, and the PAPI row beside the near threshold.
  ctx.save();
  for (let z = cz - hl + 12; z <= cz + hl - 8; z += 50) {
    for (const sx of [-1, 1]) {
      const dot = projectCircle(ctx, projector, [cx + sx * (hw + 2.5), y + 0.8, z], 0.9);
      if (dot !== null) {
        ctx.fillStyle = 'rgba(255,196,92,0.95)';
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, Math.min(3.4, dot.r), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  for (let i = 0; i < 4; i += 1) {
    const dot = projectCircle(ctx, projector, [cx - hw - 7, y + 1, cz + hl - 42 - i * 0.01], 1);
    if (dot !== null) {
      ctx.fillStyle = i < 2 ? 'rgba(255,84,72,0.95)' : 'rgba(245,248,255,0.95)';
      ctx.beginPath();
      ctx.arc(dot.x + i * dot.r * 2.4, dot.y, Math.min(3.2, dot.r), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Box faces for a building, world-space, ready to join the sorted object pass. */
function buildingFaces(b, faces) {
  const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2;
  const z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
  const y0 = b.ground - 1;
  const y1 = b.ground + b.h;
  const wallTone = b.tone ?? 1;
  const wall = [Math.round(196 * wallTone), Math.round(188 * wallTone), Math.round(172 * wallTone)];
  const roofColor = b.roof === false ? [120, 116, 110] : [148, 74, 58];
  const add = (points, color) => {
    const n = faceNormal(points);
    if (n[1] < -0.4) return; // undersides are never seen
    faces.push({ points, color: shade(color, n[0], n[1], n[2]) });
  };
  add([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], roofColor);
  add([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], wall);
  add([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], wall);
  add([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], wall);
  add([[x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [x1, y0, z1]], wall);
  if (b.tower) {
    const cab = 4.4;
    const cx0 = b.x - cab, cx1 = b.x + cab, cz0 = b.z - cab, cz1 = b.z + cab;
    const glass = [86, 140, 168];
    add([[cx0, y1 + 4.6, cz0], [cx1, y1 + 4.6, cz0], [cx1, y1 + 4.6, cz1], [cx0, y1 + 4.6, cz1]], [70, 72, 76]);
    add([[cx0, y1, cz0], [cx0, y1 + 4.6, cz0], [cx0, y1 + 4.6, cz1], [cx0, y1, cz1]], glass);
    add([[cx1, y1, cz0], [cx1, y1, cz1], [cx1, y1 + 4.6, cz1], [cx1, y1 + 4.6, cz0]], glass);
    add([[cx0, y1, cz0], [cx1, y1, cz0], [cx1, y1 + 4.6, cz0], [cx0, y1 + 4.6, cz0]], glass);
    add([[cx0, y1, cz1], [cx0, y1 + 4.6, cz1], [cx1, y1 + 4.6, cz1], [cx1, y1, cz1]], glass);
  }
}

function drawObjects(ctx, projector, world, ringStates, elapsed) {
  const faces = [];
  for (const b of world.buildings) buildingFaces(b, faces);
  for (const b of AIRFIELD_BUILDINGS) {
    buildingFaces({ ...b, ground: RUNWAY.plateauHeight, tone: 1.02, roof: false }, faces);
  }
  // The lighthouse: a tapered white octagon with red bands and a lamp room.
  const lh = LIGHTHOUSE;
  const lhGround = terrainHeight(lh.x, lh.z);
  const sides = 8;
  for (let i = 0; i < sides; i += 1) {
    const a0 = (i / sides) * Math.PI * 2;
    const a1 = ((i + 1) / sides) * Math.PI * 2;
    const r0 = 3.6, r1 = 2.5;
    const band = (i % 2 === 0) ? [232, 234, 236] : [196, 52, 52];
    const points = [
      [lh.x + Math.cos(a0) * r0, lhGround, lh.z + Math.sin(a0) * r0],
      [lh.x + Math.cos(a1) * r0, lhGround, lh.z + Math.sin(a1) * r0],
      [lh.x + Math.cos(a1) * r1, lhGround + lh.h, lh.z + Math.sin(a1) * r1],
      [lh.x + Math.cos(a0) * r1, lhGround + lh.h, lh.z + Math.sin(a0) * r1],
    ];
    const n = faceNormal(points);
    faces.push({ points, color: shade(band, n[0], n[1], n[2]) });
  }
  const lamp = projectCircle(ctx, projector, [lh.x, lhGround + lh.h + 2.4, lh.z], 1.6);
  for (const face of faces) {
    face.depth = projector.depthOf(face.points[0]);
  }
  faces.sort((a, b) => b.depth - a.depth);
  for (const face of faces) fillPoly(ctx, projector, face.points, face.color, true);
  if (lamp !== null) {
    ctx.fillStyle = 'rgba(255,214,120,0.95)';
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y, Math.min(5, lamp.r + 1.4), 0, Math.PI * 2);
    ctx.fill();
  }
  drawRings(ctx, projector, ringStates, elapsed);
}

function drawRings(ctx, projector, ringStates, elapsed) {
  const order = RINGS.map((ring, index) => ({ ring, index, depth: projector.depthOf([ring.x, ring.y, ring.z]) }));
  order.sort((a, b) => b.depth - a.depth);
  for (const { ring, index } of order) {
    const state = ringStates[index];
    if (state === 'done') continue;
    const n = ringNormal(index);
    const u = { x: -n.z, z: n.x };
    const radius = 26;
    const tube = 2.4;
    const segments = 18;
    let color = [168, 216, 234]; // upcoming: pale cyan
    if (state === 'next') {
      const pulse = 0.72 + 0.28 * Math.sin(elapsed * 5);
      color = [Math.round(255 * pulse + 40), Math.round(196 * pulse + 30), 52];
    }
    const outer = [];
    const inner = [];
    let visible = true;
    for (let i = 0; i <= segments; i += 1) {
      const a = (i / segments) * Math.PI * 2;
      const dx = u.x * Math.cos(a);
      const dz = u.z * Math.cos(a);
      const dy = Math.sin(a);
      const o = projector.project([ring.x + dx * (radius + tube), ring.y + dy * (radius + tube), ring.z + dz * (radius + tube)]);
      const inn = projector.project([ring.x + dx * (radius - tube), ring.y + dy * (radius - tube), ring.z + dz * (radius - tube)]);
      if (o === null || inn === null) { visible = false; break; }
      outer.push(o);
      inner.push(inn);
    }
    if (!visible) continue;
    const depth = projector.depthOf([ring.x, ring.y, ring.z]);
    const fogged = mixColor(color, FOG_RGB, clamp((depth - 650) / 2500, 0, 0.7));
    ctx.fillStyle = css(fogged);
    ctx.beginPath();
    ctx.moveTo(outer[0].x, outer[0].y);
    for (let i = 1; i < outer.length; i += 1) ctx.lineTo(outer[i].x, outer[i].y);
    for (let i = inner.length - 1; i >= 0; i -= 1) ctx.lineTo(inner[i].x, inner[i].y);
    ctx.closePath();
    ctx.fill();
    if (state === 'next') {
      const centre = projector.project([ring.x, ring.y, ring.z]);
      if (centre !== null) {
        ctx.fillStyle = 'rgba(255,214,92,0.9)';
        ctx.beginPath();
        ctx.arc(centre.x, centre.y, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawClouds(ctx, projector, world) {
  const sorted = [...world.clouds].sort((a, b) => projector.depthOf([b.x, b.y, b.z]) - projector.depthOf([a.x, a.y, a.z]));
  for (const cloud of sorted) {
    for (let p = 0; p < cloud.puffs; p += 1) {
      const ox = Math.sin(cloud.seed + p * 1.7) * cloud.r * 0.45;
      const oz = Math.cos(cloud.seed + p * 2.3) * cloud.r * 0.3;
      const s = projector.project([cloud.x + ox, cloud.y + Math.sin(cloud.seed + p) * 8, cloud.z + oz]);
      if (s === null) continue;
      const r = (cloud.r * 0.55 * 340) / Math.max(s.depth, 60);
      if (r < 3 || r > 900) continue;
      ctx.fillStyle = 'rgba(250,252,255,0.55)';
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, r, r * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawPlaneShadow(ctx, projector, plane) {
  const ground = terrainHeight(plane.x, plane.z);
  const heightAbove = plane.y - ground;
  if (heightAbove > 320) return;
  const alpha = clamp(0.34 - heightAbove / 1000, 0.06, 0.34);
  const points = [];
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2;
    points.push([plane.x + Math.cos(a) * 7.5, ground + 0.35, plane.z + Math.sin(a) * 7.5]);
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  fillPoly(ctx, projector, points, [10, 16, 20], false);
  ctx.restore();
}

function drawPlane(ctx, projector, plane, propAngle) {
  const faces = planeFaces(plane, propAngle).map((face) => {
    const n = faceNormal(face.points);
    return { ...face, color: shade(face.color, n[0], n[1], n[2]), depth: projector.depthOf(face.points[0]) };
  });
  faces.sort((a, b) => b.depth - a.depth);
  for (const face of faces) fillPoly(ctx, projector, face.points, face.color, false);
}

/**
 * Draw the whole 3D scene for `game` ({ plane, world, ringStates, propAngle, elapsed })
 * through `camera`. The HUD is drawn separately by hud.js.
 */
export function drawScene(ctx, width, height, camera, game) {
  const projector = makeProjector(camera, width, height, game.plane);
  projector.camX = camera.pos.x;
  projector.camZ = camera.pos.z;
  drawSky(ctx, width, height, projector);
  drawSea(ctx, projector);
  drawTerrain(ctx, projector);
  drawRunway(ctx, projector);
  drawPlaneShadow(ctx, projector, game.plane);
  drawObjects(ctx, projector, game.world, game.ringStates, game.elapsed);
  drawClouds(ctx, projector, game.world);
  drawPlane(ctx, projector, game.plane, game.propAngle);
}
