// The cockpit: a lit instrument dash across the bottom of the screen and the HUD readouts
// the brief asks for — altitude, speed and heading always on show. Gauges are drawn as real
// instruments (an artificial horizon that rolls and pitches with the aeroplane, needle
// airspeed and altimeter dials, a compass tape), flanked by throttle, fuel and damage bars
// and the three green gear lights, so a screenshot reads as a cockpit at a glance.

import { COURSE, PLANE, RUNWAY } from './config.js';
import { altitudeAboveGround, headingDegrees } from './flight.js';

const INK = '#d7ecff';
const CYAN = '#6fd3ff';
const AMBER = '#ffc45e';
const RED = '#ff5f52';
const GREEN = '#69e58a';
const PANEL = 'rgba(10, 15, 22, 0.88)';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function litText(ctx, text, x, y, { size = 15, color = INK, align = 'left', font = 'ui-monospace, Menlo, monospace', weight = '700' } = {}) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = color;
  ctx.shadowBlur = 7;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** A labelled digital readout box, top-left HUD style. */
function readout(ctx, x, y, label, value, color = INK) {
  ctx.save();
  ctx.fillStyle = PANEL;
  roundRect(ctx, x, y, 108, 44, 7);
  ctx.fill();
  ctx.strokeStyle = 'rgba(111,211,255,0.35)';
  ctx.stroke();
  ctx.restore();
  litText(ctx, label, x + 10, y + 16, { size: 10, color: CYAN });
  litText(ctx, value, x + 10, y + 37, { size: 19, color });
}

/** The artificial horizon: sky and ground halves roll with the bank and shift with pitch. */
function drawHorizon(ctx, cx, cy, r, plane) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#10151d';
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.translate(cx, cy);
  ctx.rotate(-plane.roll);
  const pitchShift = clamp(plane.pitch, -0.5, 0.55) * r * 1.15;
  ctx.fillStyle = '#3f7fc1';
  ctx.fillRect(-r * 1.5, -r * 1.5 + pitchShift, r * 3, r * 1.5);
  ctx.fillStyle = '#7a5a38';
  ctx.fillRect(-r * 1.5, pitchShift, r * 3, r * 1.5);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-r * 1.5, pitchShift);
  ctx.lineTo(r * 1.5, pitchShift);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1;
  for (const deg of [-20, -10, 10, 20]) {
    const y = pitchShift - (deg / 30) * r * 0.58;
    const w = deg % 20 === 0 ? r * 0.42 : r * 0.26;
    ctx.beginPath();
    ctx.moveTo(-w, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.restore();
  // Fixed aircraft symbol and bezel.
  ctx.save();
  ctx.strokeStyle = AMBER;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.52, cy);
  ctx.lineTo(cx - r * 0.16, cy);
  ctx.lineTo(cx - r * 0.16, cy + r * 0.14);
  ctx.moveTo(cx + r * 0.52, cy);
  ctx.lineTo(cx + r * 0.16, cy);
  ctx.lineTo(cx + r * 0.16, cy + r * 0.14);
  ctx.stroke();
  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.arc(cx, cy, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(160,190,215,0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  litText(ctx, 'ATTITUDE', cx, cy + r + 15, { size: 9, color: CYAN, align: 'center' });
}

/** A needle dial: value mapped across 240 degrees of sweep. */
function drawDial(ctx, cx, cy, r, value, max, label, unit, dangerFrom) {
  ctx.save();
  ctx.fillStyle = '#10151d';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(160,190,215,0.8)';
  ctx.lineWidth = 2;
  ctx.stroke();
  const start = Math.PI * 0.75;
  const sweep = Math.PI * 1.5;
  for (let i = 0; i <= 10; i += 1) {
    const a = start + (i / 10) * sweep;
    const inner = r - 7;
    ctx.strokeStyle = dangerFrom !== undefined && i / 10 >= dangerFrom ? RED : 'rgba(215,236,255,0.85)';
    ctx.lineWidth = i % 5 === 0 ? 2.2 : 1.2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    ctx.lineTo(cx + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2));
    ctx.stroke();
  }
  const a = start + clamp(value / max, 0, 1) * sweep;
  ctx.strokeStyle = AMBER;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(a) * (r - 9), cy + Math.sin(a) * (r - 9));
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  litText(ctx, label, cx, cy + r + 15, { size: 9, color: CYAN, align: 'center' });
  litText(ctx, `${Math.round(value)}${unit}`, cx, cy + r * 0.52, { size: 12, color: INK, align: 'center' });
}

/** A vertical bar gauge for throttle, fuel or damage. */
function drawBar(ctx, x, y, w, h, fraction, color, label, valueText) {
  ctx.save();
  ctx.fillStyle = '#10151d';
  roundRect(ctx, x, y, w, h, 5);
  ctx.fill();
  ctx.strokeStyle = 'rgba(160,190,215,0.4)';
  ctx.stroke();
  const fillH = (h - 6) * clamp(fraction, 0, 1);
  ctx.fillStyle = color;
  roundRect(ctx, x + 3, y + h - 3 - fillH, w - 6, fillH, 3);
  ctx.fill();
  ctx.restore();
  litText(ctx, label, x + w / 2, y + h + 15, { size: 9, color: CYAN, align: 'center' });
  litText(ctx, valueText, x + w / 2, y - 6, { size: 11, color: INK, align: 'center' });
}

/** The compass tape across the top centre: heading in the middle, ticks either side. */
function drawCompass(ctx, width, plane) {
  const hdg = headingDegrees(plane);
  const cx = width / 2;
  ctx.save();
  ctx.fillStyle = PANEL;
  roundRect(ctx, cx - 130, 12, 260, 34, 7);
  ctx.fill();
  ctx.strokeStyle = 'rgba(111,211,255,0.35)';
  ctx.stroke();
  ctx.beginPath();
  ctx.rect(cx - 124, 14, 248, 30);
  ctx.clip();
  const pxPerDeg = 3.1;
  for (let d = -45; d <= 45; d += 5) {
    const deg = Math.round((hdg + d) / 5) * 5;
    const x = cx + (deg - hdg) * pxPerDeg;
    const norm = ((deg % 360) + 360) % 360;
    ctx.strokeStyle = 'rgba(215,236,255,0.7)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x, 38);
    ctx.lineTo(x, norm % 30 === 0 ? 30 : 34);
    ctx.stroke();
    if (norm % 30 === 0) {
      const names = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
      const label = names[norm] ?? String(norm / 10).padStart(2, '0');
      litText(ctx, label, x, 27, { size: 11, color: norm === 0 ? AMBER : INK, align: 'center' });
    }
  }
  ctx.restore();
  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.moveTo(cx - 5, 46);
  ctx.lineTo(cx + 5, 46);
  ctx.lineTo(cx, 52);
  ctx.closePath();
  ctx.fill();
  litText(ctx, `${String(Math.round(hdg)).padStart(3, '0')}°`, cx, 66, { size: 13, color: AMBER, align: 'center' });
}

/**
 * Draw the full HUD and cockpit dash for `game` ({ plane, mission }). The dash occupies the
 * bottom of the frame; the 3D view is composed to keep the action above it.
 */
export function drawHUD(ctx, width, height, game) {
  const { plane, mission } = game;
  const altitude = Math.max(0, plane.y - RUNWAY.plateauHeight);
  const speedKmh = plane.speed * 3.6;

  readout(ctx, 14, 12, 'ALTITUDE', `${Math.round(altitude)} m`);
  readout(ctx, 130, 12, 'AIRSPEED', `${Math.round(speedKmh)} km/h`, plane.stalled ? RED : INK);
  readout(ctx, 246, 12, 'VERT SPEED', `${plane.vy >= 0 ? '+' : ''}${plane.vy.toFixed(1)} m/s`, plane.vy < -6 ? RED : INK);
  drawCompass(ctx, width, plane);

  readout(ctx, width - 122, 12, 'SCORE', `${mission.score}`);
  readout(ctx, width - 238, 12, 'RINGS', `${mission.ringsPassed} / ${COURSE.ringCount}`, mission.ringsPassed === COURSE.ringCount ? GREEN : INK);
  readout(ctx, width - 354, 12, 'TIME', `${Math.floor(mission.elapsed / 60)}:${String(Math.floor(mission.elapsed % 60)).padStart(2, '0')}`);

  // The dash.
  const dashH = Math.round(height * 0.235);
  const dashY = height - dashH;
  ctx.save();
  ctx.fillStyle = PANEL;
  ctx.beginPath();
  ctx.moveTo(0, dashY + 14);
  ctx.quadraticCurveTo(width / 2, dashY - 12, width, dashY + 14);
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(111,211,255,0.4)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, dashY + 14);
  ctx.quadraticCurveTo(width / 2, dashY - 12, width, dashY + 14);
  ctx.stroke();
  ctx.restore();

  const cy = dashY + dashH * 0.44;
  const r = Math.min(64, dashH * 0.36);
  drawHorizon(ctx, 92, cy, r, plane);
  drawDial(ctx, 216, cy, r, speedKmh, 420, 'AIRSPEED', '', 0.86);
  drawDial(ctx, 340, cy, r, altitude, 600, 'ALTIMETER', ' m');

  // Centre of the dash: the mission message and the phase.
  litText(ctx, mission.phaseLabel, width / 2, dashY + 34, { size: 13, color: CYAN, align: 'center' });
  litText(ctx, mission.message, width / 2, dashY + 62, { size: 16, color: AMBER, align: 'center' });
  if (mission.subMessage) {
    litText(ctx, mission.subMessage, width / 2, dashY + 84, { size: 12, color: INK, align: 'center' });
  }

  // Right cluster: throttle, fuel, damage, gear lights.
  const barH = dashH * 0.52;
  const barY = dashY + dashH * 0.2;
  drawBar(ctx, width - 300, barY, 26, barH, plane.throttle, AMBER, 'THROTTLE', `${Math.round(plane.throttle * 100)}%`);
  drawBar(ctx, width - 252, barY, 26, barH, plane.fuel / PLANE.fuelCapacity, plane.fuel < 22 ? RED : GREEN, 'FUEL', `${Math.round(plane.fuel)}`);
  drawBar(ctx, width - 204, barY, 26, barH, plane.damage / 100, plane.damage > 55 ? RED : '#c9d4dd', 'DAMAGE', `${Math.round(plane.damage)}%`);

  const gearX = width - 138;
  litText(ctx, 'GEAR', gearX + 24, barY + 4, { size: 9, color: CYAN, align: 'center' });
  for (let i = 0; i < 3; i += 1) {
    ctx.save();
    ctx.fillStyle = plane.gearDown ? GREEN : '#26303a';
    ctx.shadowColor = plane.gearDown ? GREEN : 'transparent';
    ctx.shadowBlur = plane.gearDown ? 8 : 0;
    ctx.beginPath();
    ctx.arc(gearX + i * 24, barY + 22, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  const warnings = [];
  if (plane.stalled) warnings.push('STALL');
  if (!plane.gearDown && altitudeAboveGround(plane) < 60 && plane.speed < 48 && !plane.onGround) warnings.push('GEAR UP');
  if (plane.fuel <= 0) warnings.push('FUEL EMPTY');
  else if (plane.fuel < 18) warnings.push('FUEL LOW');
  warnings.forEach((warning, i) => {
    if (Math.floor(game.elapsed * 2.4) % 2 === 0 || warning !== 'STALL') {
      litText(ctx, `⚠ ${warning}`, gearX + 24, barY + 52 + i * 18, { size: 12, color: RED, align: 'center' });
    }
  });

  // AGL readout under the gear cluster.
  litText(ctx, `AGL ${Math.max(0, Math.round(altitudeAboveGround(plane)))} m`, gearX + 24, dashY + dashH - 12, { size: 11, color: INK, align: 'center' });
}

/** A centred event flash ("RING 3 · +210") that fades over its lifetime. */
export function drawFlash(ctx, width, height, flash, now) {
  if (!flash || now > flash.until) return;
  const t = (flash.until - now) / flash.duration;
  ctx.save();
  ctx.globalAlpha = clamp(t * 1.6, 0, 1);
  litText(ctx, flash.text, width / 2, height * 0.3, { size: 34, color: flash.color ?? AMBER, align: 'center' });
  ctx.restore();
}
