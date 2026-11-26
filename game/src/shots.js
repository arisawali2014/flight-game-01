// The screenshot scenes behind ?shot=takeoff|rings|approach|landed. Each stages a real
// sortie moment — the aeroplane placed mid-flight with a mission in progress — then plays
// the real rules forward a few fixed steps, so the frame is what the game actually looks
// like at that moment and the same scene always renders the same frame.

import { STEP } from './config.js';
import { createPlane } from './flight.js';
import { createMission, PHASE_APPROACH, PHASE_DONE, PHASE_RINGS } from './mission.js';
import { stepPlane } from './flight.js';
import { stepMission } from './mission.js';
import { RINGS } from './world.js';

const IDLE = { pitch: 0, roll: 0, throttleDelta: 0, rudder: 0, brake: false };

/** Play the staged sortie forward under fixed controls for `seconds` of game time. */
function advance(game, controls, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const prev = { ...game.plane };
    const event = stepPlane(game.plane, controls, STEP);
    stepMission(game.mission, game.plane, prev, event, STEP);
    game.elapsed += STEP;
    game.propAngle += STEP * (4 + game.plane.throttle * 42);
  }
}

/** On the runway at rotation speed, nose coming up, the strip running away ahead. */
function stageTakeoff(game) {
  game.plane.throttle = 1;
  game.plane.speed = 33;
  game.plane.pitch = 0.03;
  advance(game, { ...IDLE, pitch: 0.35, throttleDelta: 1 }, 0.45);
}

/** Banked onto the fifth ring, down the east coast with the town below and the sea abeam. */
function stageRings(game) {
  const ring = RINGS[4];
  game.mission.ringsPassed = 4;
  game.mission.ringStates = RINGS.map((_, i) => (i < 4 ? 'done' : i === 4 ? 'next' : 'todo'));
  game.mission.score = 1090;
  game.mission.elapsed = 132;
  setPhaseDirect(game.mission, PHASE_RINGS, 'Ring 5 of 8', 'Thread the gold ring');
  Object.assign(game.plane, {
    x: ring.x - 20,
    y: ring.y + 6,
    z: ring.z - 189,
    heading: 3.03,
    pitch: 0.0,
    roll: 0.3,
    speed: 66,
    throttle: 0.75,
    gearDown: false,
    onGround: false,
    fuel: 64,
  });
  advance(game, { ...IDLE, roll: 0.18, pitch: 0.04 }, 0.3);
}

/** On final for Runway 36: gear down, PAPI lights ahead, the strip lined up. */
function stageApproach(game) {
  game.mission.ringsPassed = 8;
  game.mission.ringStates = RINGS.map(() => 'done');
  game.mission.score = 1640;
  game.mission.elapsed = 236;
  setPhaseDirect(game.mission, PHASE_APPROACH, 'All rings — come home and land on Runway 36', 'Gear down, line up from the south');
  Object.assign(game.plane, {
    x: -650,
    y: 26 + 96,
    z: 850 + 660,
    heading: 0,
    pitch: -0.045,
    roll: 0,
    speed: 35,
    throttle: 0.32,
    gearDown: true,
    onGround: false,
    fuel: 41,
  });
  advance(game, { ...IDLE, pitch: -0.02 }, 0.5);
}

/** Rolled to a stop on the strip, the sortie graded: the end-of-flight frame. */
function stageLanded(game) {
  game.mission.ringsPassed = 8;
  game.mission.ringStates = RINGS.map(() => 'done');
  game.mission.score = 2210;
  game.mission.elapsed = 252;
  game.mission.landingGrade = 'PERFECT';
  game.mission.landingPoints = 500;
  game.mission.timeBonus = 96;
  game.mission.finalScore = 2210;
  setPhaseDirect(game.mission, PHASE_DONE, 'Touchdown — PERFECT', 'Press Enter to fly again');
  Object.assign(game.plane, {
    x: -648,
    y: 26 + 1.7,
    z: 330,
    heading: 0,
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    gearDown: true,
    onGround: true,
    fuel: 38,
  });
  advance(game, IDLE, 0.1);
}

function setPhaseDirect(mission, phase, message, subMessage) {
  mission.phase = phase;
  mission.phaseLabel = {
    rings: 'HARBOUR CIRCUIT · RING RUN',
    approach: 'FINAL · RUNWAY 36',
    done: 'SORTIE COMPLETE',
  }[phase] ?? mission.phaseLabel;
  mission.message = message;
  mission.subMessage = subMessage;
}

/**
 * Stage the named scene into a fresh game and return it. Any other name is the takeoff.
 * The caller renders one frame (scene, HUD, and the end panel when the sortie is done).
 */
export function stageShot(name, world) {
  const game = {
    plane: createPlane(),
    mission: createMission(),
    world,
    propAngle: 0.6,
    elapsed: 0,
  };
  if (name === 'rings') stageRings(game);
  else if (name === 'approach') stageApproach(game);
  else if (name === 'landed') stageLanded(game);
  else stageTakeoff(game);
  game.mission.elapsed = game.mission.elapsed || game.elapsed;
  return game;
}
