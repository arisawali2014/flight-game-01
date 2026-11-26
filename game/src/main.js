// Skyharbor Run — boot and the game loop. One sortie at a time: the fixed-step flight model
// and mission advance together, the renderer draws the chase view, the HUD draws the
// cockpit, and the synthesised sound follows the aeroplane. With ?shot=<scene> in the URL
// the page instead stages that screenshot scene, renders a single frame and raises
// window.__shotReady for the screenshot script.

import { STEP } from './config.js';
import { createPlane, stepPlane } from './flight.js';
import {
  createMission, missionSummary, stepMission,
  PHASE_BRIEF, PHASE_CRASHED, PHASE_DONE,
} from './mission.js';
import { buildWorld } from './world.js';
import { createCamera, drawScene, updateCamera } from './render.js';
import { drawFlash, drawHUD } from './hud.js';
import { attachInput, readControls, wasPressed } from './input.js';
import { initAudio, stallWarble, updateAudio } from './audio.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');

function fitCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

/** A whole game: world, aeroplane, mission, camera and the running clock. */
function newGame() {
  return {
    plane: createPlane(),
    mission: createMission(),
    world: buildWorld(),
    camera: createCamera(),
    propAngle: 0,
    elapsed: 0,
  };
}

/** The title card over the parked aeroplane: the sortie, the course and the controls. */
function drawTitle(ctx, width, height) {
  ctx.save();
  ctx.fillStyle = 'rgba(6, 12, 20, 0.55)';
  ctx.fillRect(0, 0, width, height * 0.52);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f4f9ff';
  ctx.font = '800 54px ui-rounded, system-ui, sans-serif';
  ctx.shadowColor = '#6fd3ff';
  ctx.shadowBlur = 18;
  ctx.fillText('SKYHARBOR RUN', width / 2, height * 0.17);
  ctx.shadowBlur = 0;
  ctx.font = '500 17px system-ui, sans-serif';
  ctx.fillStyle = '#cfe6f7';
  ctx.fillText('Take off from Runway 36, thread eight rings around the island, and land her home again.', width / 2, height * 0.17 + 34);
  ctx.font = '600 15px ui-monospace, Menlo, monospace';
  ctx.fillStyle = '#ffc45e';
  ctx.fillText('W / S throttle · ↑ climb · ↓ dive · ← → bank · Q / E rudder · G gear · B brake', width / 2, height * 0.17 + 66);
  ctx.fillStyle = '#9fd8a8';
  ctx.fillText('Throttle up to begin — a gentle touchdown scores best', width / 2, height * 0.17 + 92);
  ctx.restore();
}

/** The end-of-sortie panel: grade, rings, points and the way back in. */
function drawEndPanel(ctx, width, height, mission) {
  const summary = missionSummary(mission);
  const crashed = mission.phase === PHASE_CRASHED;
  const w = 430;
  const h = 252;
  const x = (width - w) / 2;
  const y = height * 0.13;
  ctx.save();
  ctx.fillStyle = 'rgba(8, 13, 20, 0.88)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 14);
  ctx.fill();
  ctx.strokeStyle = crashed ? '#ff5f52' : '#ffc45e';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = crashed ? '#ff8a7a' : '#ffc45e';
  ctx.font = '800 30px system-ui, sans-serif';
  ctx.fillText(crashed ? 'SORTIE OVER' : `TOUCHDOWN — ${summary.grade}`, width / 2, y + 48);
  ctx.font = '600 16px ui-monospace, Menlo, monospace';
  ctx.fillStyle = '#d7ecff';
  const rows = [
    ['Rings threaded', summary.rings],
    ['Landing points', crashed ? '—' : `${summary.landingPoints}`],
    ['Time bonus', crashed ? '—' : `${summary.timeBonus}`],
    ['Sortie time', summary.time],
  ];
  rows.forEach(([label, value], i) => {
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 36, y + 92 + i * 26);
    ctx.textAlign = 'right';
    ctx.fillText(value, x + w - 36, y + 92 + i * 26);
  });
  ctx.textAlign = 'center';
  ctx.font = '800 21px ui-monospace, Menlo, monospace';
  ctx.fillStyle = '#6fd3ff';
  ctx.fillText(`SCORE  ${summary.score}`, width / 2, y + 92 + rows.length * 26 + 12);
  ctx.font = '600 14px system-ui, sans-serif';
  ctx.fillStyle = '#cfe6f7';
  ctx.fillText('Press Enter to fly again', width / 2, y + h - 16);
  ctx.restore();
}

function drawFrame(game, snapCamera) {
  updateCamera(game.camera, game.plane, STEP, snapCamera);
  drawScene(ctx, canvas.width, canvas.height, game.camera, {
    plane: game.plane,
    world: game.world,
    ringStates: game.mission.ringStates,
    propAngle: game.propAngle,
    elapsed: game.elapsed,
  });
  drawHUD(ctx, canvas.width, canvas.height, game);
  drawFlash(ctx, canvas.width, canvas.height, game.mission.flash, game.mission.elapsed);
  if (game.mission.phase === PHASE_BRIEF && game.plane.speed === 0 && game.plane.throttle === 0) {
    drawTitle(ctx, canvas.width, canvas.height);
  }
  if (game.mission.phase === PHASE_DONE || game.mission.phase === PHASE_CRASHED) {
    drawEndPanel(ctx, canvas.width, canvas.height, game.mission);
  }
}

const params = new URLSearchParams(window.location.search);
if (params.has('shot')) {
  const game = stageShot(params.get('shot'), buildWorld());
  game.camera = createCamera();
  drawFrame(game, true);
  status.textContent = `Skyharbor Run screenshot scene: ${params.get('shot')}`;
  window.__shotReady = true;
} else {
  attachInput(window);
  window.addEventListener('keydown', initAudio, { once: false });
  window.addEventListener('pointerdown', initAudio, { once: false });
  let game = newGame();
  let last = performance.now();
  let accumulator = 0;
  let stallBeeps = 0;

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    accumulator += dt;
    let steps = 0;
    while (accumulator >= STEP && steps < 8) {
      const controls = readControls();
      if (wasPressed('KeyG') && (!game.plane.onGround || game.plane.speed < 2)) {
        game.plane.gearDown = !game.plane.gearDown;
      }
      if ((game.mission.phase === PHASE_DONE || game.mission.phase === PHASE_CRASHED) && wasPressed('Enter')) {
        game = newGame();
      }
      const prev = { ...game.plane };
      const event = stepPlane(game.plane, controls, STEP);
      stepMission(game.mission, game.plane, prev, event, STEP);
      game.elapsed += STEP;
      game.propAngle += STEP * (4 + game.plane.throttle * 42 + game.plane.speed * 0.1);
      accumulator -= STEP;
      steps += 1;
    }
    if (game.plane.stalled) {
      stallBeeps += dt;
      if (stallBeeps > 0.34) {
        stallWarble();
        stallBeeps = 0;
      }
    }
    drawFrame(game, false);
    updateAudio(game.plane);
    status.textContent = `${game.mission.phaseLabel}: score ${game.mission.score}, rings ${game.mission.ringsPassed} of 8`;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
