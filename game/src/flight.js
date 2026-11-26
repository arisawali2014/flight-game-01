// The flight model: an arcade-honest little aeroplane. Throttle makes speed, speed makes
// lift, bank makes the turn (yaw comes from sin(roll), so a pilot who stays wings-level flies
// straight), pitch trades speed for height, and below the stall speed the nose drops and the
// sink builds. The ground is sampled from world.js, so the runway plateau, a hillside and the
// sea are all landable — or crashable — exactly where they are drawn.

import { PLANE, RUNWAY } from './config.js';
import { overRunway, terrainHeight } from './world.js';

/** Events a step can raise; the mission reads them to score and to end the sortie. */
export const EVENT_NONE = 0;
export const EVENT_TOUCHDOWN = 1;
export const EVENT_CRASH = 2;
export const EVENT_TOOK_OFF = 3;

/** A fresh aeroplane parked at the south threshold of Runway 36, engine idling. */
export function createPlane() {
  return {
    x: RUNWAY.centreX,
    y: RUNWAY.plateauHeight + PLANE.wheelHeight,
    z: RUNWAY.centreZ + RUNWAY.length / 2 - 60,
    heading: 0,
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    vy: 0,
    gearDown: true,
    onGround: true,
    stalled: false,
    fuel: PLANE.fuelCapacity,
    damage: 0,
    crashed: false,
    touchdownVy: 0,
    touchdownSpeed: 0,
  };
}

/** The 3D forward vector for a heading/pitch pair. */
export function forwardVector(heading, pitch) {
  const cp = Math.cos(pitch);
  return { x: Math.sin(heading) * cp, y: Math.sin(pitch), z: -Math.cos(heading) * cp };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Advance the aeroplane one fixed step under `controls` (see input.js). Returns an EVENT_*
 * code. Ground handling: a gentle arrival on the runway with the gear down rolls out; a
 * gentle arrival anywhere else is a rough-field landing that may bend the aeroplane; anything
 * harder, faster or gear-up is a crash.
 */
export function stepPlane(plane, controls, dt) {
  if (plane.crashed) return EVENT_NONE;
  let event = EVENT_NONE;

  // Controls shape attitude; attitude is rate-limited so the aeroplane feels weighty.
  const pitchTarget = controls.pitch * (controls.pitch > 0 ? PLANE.maxPitch : -PLANE.minPitch);
  const rollTarget = controls.roll * PLANE.maxRoll;
  if (plane.onGround) {
    plane.roll += (0 - plane.roll) * Math.min(1, dt * 6);
    const canRotate = plane.speed > PLANE.rotateSpeed;
    const wanted = canRotate ? pitchTarget : 0;
    plane.pitch += clamp(wanted - plane.pitch, -PLANE.pitchRate * dt, PLANE.pitchRate * dt);
  } else {
    plane.pitch += clamp(pitchTarget - plane.pitch, -PLANE.pitchRate * dt, PLANE.pitchRate * dt);
    plane.roll += clamp(rollTarget - plane.roll, -PLANE.rollRate * dt, PLANE.rollRate * dt);
  }

  // Gear toggle is handled by the caller through plane.gearDown; it only changes in the air
  // or at a standstill, never mid-roll at speed.
  plane.throttle = clamp(plane.throttle + controls.throttleDelta * dt * 0.55, 0, 1);
  const engineOut = plane.fuel <= 0;
  if (engineOut) plane.throttle = 0;
  plane.fuel = Math.max(0, plane.fuel - plane.throttle * PLANE.fuelBurnPerSecond * dt);

  // Banked turn: yaw from the bank, plus a touch of rudder.
  if (!plane.onGround) {
    const turnRate = -Math.sin(plane.roll) * (9.81 / Math.max(plane.speed, 12)) * 1.35;
    plane.heading += (turnRate + controls.rudder * 0.25) * dt;
  } else if (plane.speed > 4) {
    plane.heading += controls.rudder * 0.35 * dt * (plane.speed / 30);
  }

  // Speed: thrust against drag and the gravity tax of climbing.
  const drag = 0.0038 * plane.speed * plane.speed + 1.1 + (plane.gearDown ? 1.6 : 0);
  const accel = plane.throttle * PLANE.maxThrottleAccel - drag - 9.4 * Math.sin(plane.pitch);
  plane.speed = clamp(plane.speed + accel * dt, 0, PLANE.maxSpeed);

  // Stall: too slow in the air, the nose falls away and the sink rate grows.
  plane.stalled = !plane.onGround && plane.speed < PLANE.stallSpeed;
  if (plane.stalled) {
    plane.pitch += clamp(-0.32 - plane.pitch, -0.9 * dt, 0.9 * dt);
  }

  const fwd = forwardVector(plane.heading, plane.pitch);
  let vy = fwd.y * plane.speed;
  if (plane.stalled) vy -= (PLANE.stallSpeed - plane.speed) * 0.55;
  if (plane.onGround) vy = 0;
  plane.vy = vy;

  const wasOnGround = plane.onGround;
  plane.x += fwd.x * plane.speed * dt;
  plane.z += fwd.z * plane.speed * dt;
  plane.y += vy * dt;

  // Keep the sortie over the island's ocean.
  const half = 2350;
  plane.x = clamp(plane.x, -half, half);
  plane.z = clamp(plane.z, -half, half);

  const ground = terrainHeight(plane.x, plane.z);
  const clearance = plane.gearDown ? PLANE.wheelHeight : PLANE.bellyHeight;
  if (plane.y <= ground + clearance) {
    plane.y = ground + clearance;
    if (!wasOnGround) {
      plane.touchdownVy = vy;
      plane.touchdownSpeed = plane.speed;
      event = judgeArrival(plane, ground);
      if (event === EVENT_CRASH) {
        plane.crashed = true;
        plane.damage = 100;
        return event;
      }
      plane.onGround = true;
    }
    // Rolling on the ground: runway or rough field, friction and brakes bite.
    const rollingDrag = controls.brake ? 7.5 : 1.4;
    plane.speed = Math.max(0, plane.speed - rollingDrag * dt * (plane.throttle > 0.05 ? 0.25 : 1));
    if (plane.speed > PLANE.rotateSpeed && plane.pitch > 0.12) {
      plane.onGround = false;
      event = EVENT_TOOK_OFF;
    }
  } else if (wasOnGround && plane.y > ground + clearance + 0.5) {
    plane.onGround = false;
    event = EVENT_TOOK_OFF;
  }
  return event;
}

/**
 * Grade an arrival the moment the wheels (or belly) meet the ground. Returns EVENT_TOUCHDOWN
 * for a survivable arrival — adding damage for a hard one — or EVENT_CRASH.
 */
function judgeArrival(plane, ground) {
  const onRunway = overRunway(plane.x, plane.z);
  const sink = -plane.touchdownVy;
  if (!plane.gearDown) {
    if (sink > 3.2 || plane.speed > 46) return EVENT_CRASH;
    plane.damage += 45;
    return EVENT_TOUCHDOWN;
  }
  if (sink > 8.5) return EVENT_CRASH;
  if (plane.speed > 78 && !onRunway) return EVENT_CRASH;
  if (ground <= 0.4 && sink > 1.5) return EVENT_CRASH; // ditched in the sea
  if (sink > 5) plane.damage += 26;
  else if (sink > 3.4) plane.damage += 12;
  if (!onRunway && sink > 2.6) plane.damage += 10; // rough field arrival
  if (plane.damage >= 100) return EVENT_CRASH;
  return EVENT_TOUCHDOWN;
}

/** Altitude above the ground directly below, in metres. */
export function altitudeAboveGround(plane) {
  return plane.y - terrainHeight(plane.x, plane.z);
}

/** Compass heading in degrees, 0-359. */
export function headingDegrees(plane) {
  const deg = (plane.heading * 180 / Math.PI) % 360;
  return (deg + 360) % 360;
}
