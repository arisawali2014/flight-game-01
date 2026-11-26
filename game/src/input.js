// Keyboard input: a held-keys set plus edge-triggered presses, read by the flight model as
// axes each step. The staged screenshot scenes feed scripted key states through `setScripted`
// so a scene can hold the throttle open or keep a bank without a pilot.
//
// Layout: ArrowUp / ArrowDown pitch (up climbs, arcade-style), ArrowLeft / ArrowRight or A / D
// roll, W / S (or Shift / Ctrl) throttle, Q / E rudder, G toggles the gear, B or Space brakes.

const held = new Set();
const pressed = new Set();
let scripted = null;

const TRACKED = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyG', 'KeyB', 'Space', 'Enter',
  'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
]);

/** Attach the keyboard listeners to `target` (the window in the browser). */
export function attachInput(target) {
  target.addEventListener('keydown', (event) => {
    if (!TRACKED.has(event.code)) return;
    if (!held.has(event.code)) pressed.add(event.code);
    held.add(event.code);
    if (event.code.startsWith('Arrow') || event.code === 'Space') event.preventDefault();
  });
  target.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  target.addEventListener('blur', () => {
    held.clear();
    pressed.clear();
  });
}

/** Replace live input with a fixed set of key codes (screenshot scenes); null restores it. */
export function setScripted(codes) {
  scripted = codes === null ? null : new Set(codes);
}

/** True while `code` is held (or scripted down). */
export function isDown(code) {
  return scripted !== null ? scripted.has(code) : held.has(code);
}

/** True only on the step where `code` was first pressed; consumes the press. */
export function wasPressed(code) {
  if (scripted !== null) return false;
  if (!pressed.has(code)) return false;
  pressed.delete(code);
  return true;
}

/**
 * Read the pilot's controls as one object: pitch in [-1, 1] (positive climbs), roll in
 * [-1, 1] (positive banks right), throttleDelta in [-1, 1], rudder in [-1, 1], brake held.
 */
export function readControls() {
  return {
    pitch: (isDown('ArrowUp') ? 1 : 0) - (isDown('ArrowDown') ? 1 : 0),
    roll: (isDown('ArrowRight') || isDown('KeyD') ? 1 : 0) - (isDown('ArrowLeft') || isDown('KeyA') ? 1 : 0),
    throttleDelta: (isDown('KeyW') || isDown('ShiftLeft') || isDown('ShiftRight') ? 1 : 0)
      - (isDown('KeyS') || isDown('ControlLeft') || isDown('ControlRight') ? 1 : 0),
    rudder: (isDown('KeyE') ? 1 : 0) - (isDown('KeyQ') ? 1 : 0),
    brake: isDown('KeyB') || isDown('Space'),
  };
}
