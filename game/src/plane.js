// The aeroplane itself: a low-poly high-wing tourer built from boxes and tapered rings in
// local space (+X right wing, +Y up, +Z aft, nose toward -Z), painted white with a red
// cheatline, fin and wing tips. planeFaces() places the model in the world under the plane's
// heading, pitch and roll and hands flat-shaded faces to the renderer; the propeller spins
// with the throttle and the gear only exists when it is down.

import { forwardVector } from './flight.js';

const WHITE = [236, 239, 242];
const RED = [196, 42, 46];
const GLASS = [34, 50, 66];
const DARK = [52, 55, 60];
const TYRE = [24, 24, 26];

/** One box as six faces (only the outward quads), centred at (cx, cy, cz). */
function box(cx, cy, cz, sx, sy, sz, color) {
  const x0 = cx - sx / 2, x1 = cx + sx / 2;
  const y0 = cy - sy / 2, y1 = cy + sy / 2;
  const z0 = cz - sz / 2, z1 = cz + sz / 2;
  return [
    { points: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], color }, // top
    { points: [[x0, y0, z0], [x0, y0, z1], [x1, y0, z1], [x1, y0, z0]], color }, // bottom
    { points: [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], color }, // right
    { points: [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], color }, // left
    { points: [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], color }, // nose side
    { points: [[x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [x1, y0, z1]], color }, // tail side
  ];
}

/** Quad strip between two fuselage rings: each ring is [halfWidth, yBottom, yTop]. */
function fuselage() {
  const rings = [
    { z: -5.4, w: 0.28, yb: -0.28, yt: 0.34 },
    { z: -3.4, w: 0.55, yb: -0.52, yt: 0.62 },
    { z: 0.6, w: 0.58, yb: -0.55, yt: 0.66 },
    { z: 3.4, w: 0.42, yb: -0.4, yt: 0.5 },
    { z: 5.2, w: 0.16, yb: -0.16, yt: 0.24 },
  ];
  const faces = [];
  for (let i = 0; i < rings.length - 1; i += 1) {
    const a = rings[i];
    const b = rings[i + 1];
    faces.push({ points: [[-a.w, a.yt, a.z], [a.w, a.yt, a.z], [b.w, b.yt, b.z], [-b.w, b.yt, b.z]], color: WHITE });
    faces.push({ points: [[-a.w, a.yb, a.z], [-b.w, b.yb, b.z], [b.w, b.yb, b.z], [a.w, a.yb, a.z]], color: [206, 210, 214] });
    faces.push({ points: [[a.w, a.yb, a.z], [b.w, b.yb, b.z], [b.w, b.yt, b.z], [a.w, a.yt, a.z]], color: RED });
    faces.push({ points: [[-a.w, a.yb, a.z], [-a.w, a.yt, a.z], [-b.w, b.yt, b.z], [-b.w, b.yb, b.z]], color: RED });
  }
  return faces;
}

/** The propeller: a spinner cone and two blades turning around the nose axis. */
function propeller(propAngle) {
  const faces = box(0, 0.05, -5.62, 0.34, 0.34, 0.3, DARK);
  const cz = -5.78;
  for (let blade = 0; blade < 2; blade += 1) {
    const a = propAngle + blade * Math.PI;
    const tip = { x: Math.cos(a) * 1.55, y: 0.05 + Math.sin(a) * 1.55 };
    const a2 = a + 0.16;
    const tip2 = { x: Math.cos(a2) * 1.55, y: 0.05 + Math.sin(a2) * 1.55 };
    faces.push({ points: [[0, 0.05, cz], [tip.x, tip.y, cz], [tip2.x, tip2.y, cz]], color: [30, 30, 34] });
  }
  return faces;
}

/** Fixed landing gear: two mains and a nose wheel on struts, only when the gear is down. */
function gear() {
  const faces = [];
  for (const sx of [-0.85, 0.85]) {
    faces.push(...box(sx, -0.95, 0.1, 0.12, 0.85, 0.12, DARK));
    faces.push(...box(sx, -1.5, 0.1, 0.34, 0.62, 0.62, TYRE));
  }
  faces.push(...box(0, -0.9, -3.6, 0.1, 0.7, 0.1, DARK));
  faces.push(...box(0, -1.42, -3.6, 0.26, 0.48, 0.48, TYRE));
  return faces;
}

/** All local-space faces of the aeroplane for this frame. */
function localFaces(plane, propAngle) {
  const faces = [];
  faces.push(...fuselage());
  faces.push(...box(0, 0.78, -1.5, 0.92, 0.5, 2.1, GLASS)); // canopy
  faces.push(...box(0, 0.28, 0.35, 13.2, 0.16, 1.7, WHITE)); // main wing
  faces.push(...box(-6.15, 0.28, 0.35, 0.9, 0.17, 1.7, RED)); // wing tips
  faces.push(...box(6.15, 0.28, 0.35, 0.9, 0.17, 1.7, RED));
  faces.push(...box(0, 0.32, 4.85, 5.4, 0.13, 1.1, WHITE)); // tailplane
  faces.push({ points: [[0.09, 0.3, 4.1], [0.09, 2.15, 5.05], [0.09, 2.15, 5.45], [0.09, 0.3, 5.5]], color: RED }); // fin right
  faces.push({ points: [[-0.09, 0.3, 4.1], [-0.09, 0.3, 5.5], [-0.09, 2.15, 5.45], [-0.09, 2.15, 5.05]], color: RED }); // fin left
  faces.push(...propeller(propAngle));
  if (plane.gearDown) faces.push(...gear());
  return faces;
}

/**
 * The aeroplane's faces in world space. The basis is built from the flight model's own
 * forward vector, so the model always points exactly where the physics says it flies;
 * roll rotates the right/up pair around that forward axis.
 */
export function planeFaces(plane, propAngle) {
  const fwd = forwardVector(plane.heading, plane.pitch);
  const right0 = { x: Math.cos(plane.heading), y: 0, z: Math.sin(plane.heading) };
  const aft = { x: -fwd.x, y: -fwd.y, z: -fwd.z };
  // up0 = aft x right0, the level-flight up vector for this heading and pitch.
  const up0 = {
    x: aft.y * right0.z - aft.z * right0.y,
    y: aft.z * right0.x - aft.x * right0.z,
    z: aft.x * right0.y - aft.y * right0.x,
  };
  const cr = Math.cos(plane.roll);
  const sr = Math.sin(plane.roll);
  const right = {
    x: right0.x * cr - up0.x * sr,
    y: right0.y * cr - up0.y * sr,
    z: right0.z * cr - up0.z * sr,
  };
  const up = {
    x: right0.x * sr + up0.x * cr,
    y: right0.y * sr + up0.y * cr,
    z: right0.z * sr + up0.z * cr,
  };
  const place = (p) => [
    plane.x + right.x * p[0] + up.x * p[1] + aft.x * p[2],
    plane.y + right.y * p[0] + up.y * p[1] + aft.y * p[2],
    plane.z + right.z * p[0] + up.z * p[1] + aft.z * p[2],
  ];
  return localFaces(plane, propAngle).map((face) => ({
    points: face.points.map(place),
    color: face.color,
  }));
}
