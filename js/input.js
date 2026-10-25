// Keyboard/mouse actions (like Godot's InputMap). Bots can hold actions through Input.force.
'use strict';
(function () {
  const I = DW.Input = {};
  const MAP = {
    move_forward: ['KeyW', 'ArrowUp'], move_back: ['KeyS', 'ArrowDown'],
    move_left: ['KeyA', 'ArrowLeft'], move_right: ['KeyD', 'ArrowRight'],
    jump: ['Space'], sprint: ['ShiftLeft', 'ShiftRight'], crouch: ['ControlLeft', 'ControlRight', 'KeyC'],
    reload: ['KeyR'], interact: ['KeyE', 'KeyF'], melee: ['KeyV', 'Mouse1'],
    grenade: ['KeyG'], weapon_1: ['Digit1'], weapon_2: ['Digit2'], weapon_3: ['Digit3', 'Mouse3', 'Mouse4'], swap: ['KeyQ'],
    scoreboard: ['Tab'], fire: ['Mouse0'], ads: ['Mouse2'], weapon_4: ['Digit4'], skip: ['Enter', 'NumpadEnter'],
  };
  const down = new Set();
  let pressed = new Set(); // went down since last frame
  I.force = {};
  I.mouseDX = 0;
  I.mouseDY = 0;
  I.wheel = 0;
  I.locked = false;

  I.action = name => !!I.force[name] || MAP[name].some(c => down.has(c));
  I.justPressed = name => MAP[name].some(c => pressed.has(c)) || !!I.forcePressed && I.forcePressed.has(name);
  I.vector = () => {
    let x = (I.action('move_right') ? 1 : 0) - (I.action('move_left') ? 1 : 0);
    let y = (I.action('move_back') ? 1 : 0) - (I.action('move_forward') ? 1 : 0);
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return [x, y];
  };
  // called once per frame after the game consumed input
  I.endFrame = () => {
    pressed = new Set();
    I.forcePressed = null;
    I.mouseDX = I.mouseDY = 0;
    I.wheel = 0;
  };
  // bot helper: press an action for one frame
  I.tap = name => { (I.forcePressed = I.forcePressed || new Set()).add(name); };
  I.releaseAll = () => { down.clear(); I.force = {}; };

  window.addEventListener('keydown', e => {
    if (!down.has(e.code)) pressed.add(e.code);
    down.add(e.code);
    if (I.locked || e.code === 'Tab') {
      if (!(e.code === 'F11' || e.code === 'F12')) e.preventDefault();
    }
  });
  window.addEventListener('keyup', e => { down.delete(e.code); });
  window.addEventListener('blur', () => down.clear());
  window.addEventListener('mousedown', e => {
    const c = 'Mouse' + e.button;
    if (!down.has(c)) pressed.add(c);
    down.add(c);
    if (I.locked && e.button === 1) e.preventDefault();
  });
  window.addEventListener('mouseup', e => { down.delete('Mouse' + e.button); });
  window.addEventListener('mousemove', e => {
    if (!I.locked) return;
    // ignore the occasional huge jump some browsers report right after locking
    if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
    I.mouseDX += e.movementX;
    I.mouseDY += e.movementY;
  });
  window.addEventListener('wheel', e => { if (I.locked) I.wheel += Math.sign(e.deltaY); }, { passive: true });
  window.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    I.locked = !!document.pointerLockElement;
    if (!I.locked) { for (const c of [...down]) if (c.startsWith('Mouse')) down.delete(c); }
    if (I.onLockChange) I.onLockChange(I.locked);
  });
  I.lock = el => {
    try {
      const r = el.requestPointerLock({ unadjustedMovement: true });
      if (r && r.catch) r.catch(() => { try { el.requestPointerLock(); } catch (e) { /* not allowed now */ } });
    } catch (e) { try { el.requestPointerLock(); } catch (er) { /* not allowed now */ } }
  };
  I.unlock = () => { if (document.pointerLockElement) document.exitPointerLock(); };
})();
