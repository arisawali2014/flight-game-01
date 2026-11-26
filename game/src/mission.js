// The sortie: one flight with a shape — take off from Runway 36, thread eight rings on a
// circuit of the island, then come home and land. The mission watches the flight model's
// events and the plane's position against the ring course, keeps the score (rings with a
// centre bonus for threading them clean, a time bonus against par, and a landing grade from
// sink rate, speed and alignment), and writes the messages the HUD shows the pilot.

import { COURSE, RUNWAY, SCORE } from './config.js';
import {
  EVENT_CRASH, EVENT_TOUCHDOWN, EVENT_TOOK_OFF,
} from './flight.js';
import { RINGS, overRunway, ringNormal } from './world.js';
import { crashSound, ringChime, touchdownThud } from './audio.js';

export const PHASE_BRIEF = 'brief';
export const PHASE_TAKEOFF = 'takeoff';
export const PHASE_RINGS = 'rings';
export const PHASE_APPROACH = 'approach';
export const PHASE_DONE = 'done';
export const PHASE_CRASHED = 'crashed';

const PHASE_LABELS = {
  brief: 'SKYHARBOR RUN · SORTIE BRIEF',
  takeoff: 'DEPARTURE · RUNWAY 36',
  rings: 'HARBOUR CIRCUIT · RING RUN',
  approach: 'FINAL · RUNWAY 36',
  done: 'SORTIE COMPLETE',
  crashed: 'SORTIE OVER',
};

/** A fresh mission, parked at the brief. */
export function createMission() {
  return {
    phase: PHASE_BRIEF,
    phaseLabel: PHASE_LABELS.brief,
    message: 'Throttle up and take off north',
    subMessage: 'W/S throttle · arrows pitch & roll · G gear · B brake',
    score: 0,
    ringsPassed: 0,
    ringStates: RINGS.map(() => 'todo'),
    elapsed: 0,
    landingGrade: null,
    landingPoints: 0,
    timeBonus: 0,
    flash: null,
    finalScore: null,
  };
}

function setPhase(mission, phase) {
  mission.phase = phase;
  mission.phaseLabel = PHASE_LABELS[phase];
}

function flash(mission, text, color, duration = 1.6) {
  mission.flash = { text, color, until: mission.elapsed + duration, duration };
}

/** Signed distance of the plane from ring `index`'s plane, along its normal. */
function ringPlaneDistance(plane, index) {
  const ring = RINGS[index];
  const n = ringNormal(index);
  return (plane.x - ring.x) * n.x + (plane.z - ring.z) * n.z;
}

/** Distance from the ring's centre in its own plane: 0 is dead centre. */
function ringCentreOffset(plane, index) {
  const ring = RINGS[index];
  const n = ringNormal(index);
  const dx = plane.x - ring.x;
  const dz = plane.z - ring.z;
  const along = dx * n.x + dz * n.z;
  const sideX = dx - along * n.x;
  const sideZ = dz - along * n.z;
  return Math.hypot(sideX, plane.y - ring.y, sideZ);
}

/**
 * Advance the mission one step: `event` is the flight model's EVENT_* for this step and
 * `prevPlane` is the aeroplane before it moved (ring crossing is a plane-crossing test).
 */
export function stepMission(mission, plane, prevPlane, event, dt) {
  if (mission.phase === PHASE_DONE || mission.phase === PHASE_CRASHED) return;
  mission.elapsed += dt;

  if (event === EVENT_CRASH) {
    setPhase(mission, PHASE_CRASHED);
    mission.message = 'The aeroplane is down';
    mission.subMessage = 'Press Enter to fly again';
    mission.finalScore = mission.score;
    crashSound();
    return;
  }

  if (mission.phase === PHASE_BRIEF && plane.speed > 2) setPhase(mission, PHASE_TAKEOFF);

  if (event === EVENT_TOOK_OFF && mission.phase === PHASE_TAKEOFF) {
    setPhase(mission, PHASE_RINGS);
    mission.ringStates[mission.ringsPassed] = 'next';
    mission.message = mission.ringsPassed === 0
      ? 'Airborne — chase the gold ring'
      : `Airborne again — ring ${mission.ringsPassed + 1} is gold`;
    mission.subMessage = 'Thread all 8 rings, then land back on Runway 36';
    flash(mission, 'AIRBORNE', '#69e58a');
  }

  if (mission.phase === PHASE_RINGS) {
    const index = mission.ringsPassed;
    const before = ringPlaneDistance(prevPlane, index);
    const after = ringPlaneDistance(plane, index);
    if (before < 0 && after >= 0) {
      const offset = ringCentreOffset(plane, index);
      if (offset <= COURSE.ringRadius) {
        const centreBonus = Math.round(SCORE.ringCentreBonus * (1 - offset / COURSE.ringRadius));
        const points = SCORE.ring + centreBonus;
        mission.score += points;
        mission.ringsPassed += 1;
        mission.ringStates[index] = 'done';
        ringChime(centreBonus > 60);
        flash(mission, `RING ${mission.ringsPassed} · +${points}`, centreBonus > 60 ? '#69e58a' : '#ffc45e');
        if (mission.ringsPassed >= COURSE.ringCount) {
          setPhase(mission, PHASE_APPROACH);
          mission.message = 'All rings — come home and land on Runway 36';
          mission.subMessage = 'Gear down (G), line up from the south, touch down gently';
        } else {
          mission.ringStates[mission.ringsPassed] = 'next';
          mission.message = `Ring ${mission.ringsPassed + 1} of ${COURSE.ringCount}`;
          mission.subMessage = '';
        }
      } else {
        flash(mission, 'WIDE — ring missed counts nothing', '#ff5f52', 1.1);
        mission.message = `You passed wide of ring ${index + 1} — circle back`;
        mission.subMessage = 'Cross through the gold ring itself';
        // The ring stays 'next': the pilot may circle and try again. The crossing test
        // re-arms itself because it needs a fresh negative-to-positive pass.
      }
    }
  }

  if (event === EVENT_TOUCHDOWN) {
    const sink = -plane.touchdownVy;
    touchdownThud(sink > 3.4);
    if (mission.phase === PHASE_APPROACH && overRunway(plane.x, plane.z)) {
      gradeLanding(mission, plane, sink);
    } else if (mission.phase === PHASE_RINGS || mission.phase === PHASE_TAKEOFF) {
      mission.message = 'Back on the ground — take off again to continue';
      mission.subMessage = '';
      if (mission.phase === PHASE_RINGS) setPhase(mission, PHASE_TAKEOFF);
    }
  }
}

/** Grade the landing that ends the sortie and close the books. */
function gradeLanding(mission, plane, sink) {
  const lateral = Math.abs(plane.x - RUNWAY.centreX);
  let grade;
  let points;
  if (!plane.gearDown) {
    grade = 'BELLY LANDING';
    points = 60;
  } else if (sink <= 2.2 && plane.touchdownSpeed <= 42 && lateral <= 9) {
    grade = 'PERFECT';
    points = SCORE.landingPerfect;
  } else if (sink <= 3.6 && plane.touchdownSpeed <= 52) {
    grade = 'SMOOTH';
    points = SCORE.landingSmooth;
  } else {
    grade = 'HARD';
    points = SCORE.landingHard;
  }
  mission.landingGrade = grade;
  mission.landingPoints = points;
  mission.timeBonus = Math.max(0, Math.round((SCORE.timeBonusPar - mission.elapsed) * SCORE.timeBonusPerSecond));
  mission.score += points + mission.timeBonus;
  mission.finalScore = mission.score;
  setPhase(mission, PHASE_DONE);
  mission.message = `Touchdown — ${grade}`;
  mission.subMessage = 'Roll out and stop, then press Enter to fly again';
  flash(mission, grade, grade === 'PERFECT' ? '#69e58a' : '#ffc45e', 2.4);
}

/** The result lines for the end-of-sortie panel. */
export function missionSummary(mission) {
  return {
    grade: mission.landingGrade ?? (mission.phase === PHASE_CRASHED ? 'CRASHED' : '—'),
    rings: `${mission.ringsPassed} / ${COURSE.ringCount}`,
    landingPoints: mission.landingPoints,
    timeBonus: mission.timeBonus,
    score: mission.finalScore ?? mission.score,
    time: `${Math.floor(mission.elapsed / 60)}:${String(Math.floor(mission.elapsed % 60)).padStart(2, '0')}`,
  };
}
