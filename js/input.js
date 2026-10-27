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
    scoreboard: ['Tab'], fire: ['Mouse0'], ads: ['Mouse2'], weapon_4: ['Digit4'], skip: ['Enter', 'NumpadEnter'], sentry: ['KeyT'], grapple: ['Digit5'],
  };
  // the first key of each action can be rebound in Settings; the extra keys stay unless another action took them
  const DEFAULTS = JSON.parse(JSON.stringify(MAP));
  I.DEFAULTS = DEFAULTS;
  I.applyBinds = binds => {
    const prim = {};
    for (const a in DEFAULTS) prim[a] = (binds && binds[a]) || DEFAULTS[a][0];
    const taken = new Set(Object.values(prim));
    for (const a in DEFAULTS) MAP[a] = [prim[a], ...DEFAULTS[a].slice(1).filter(c => !taken.has(c))];
  };
  // rebinding: a key another action already uses as its main key swaps over to that action
  I.bind = (action, code) => {
    const binds = DW.settings.binds = DW.settings.binds || {};
    const old = MAP[action][0];
    for (const a in MAP) if (a !== action && MAP[a][0] === code) binds[a] = old;
    binds[action] = code;
    for (const a in binds) if (binds[a] === DEFAULTS[a][0]) delete binds[a];
    I.applyBinds(binds);
  };
  I.primary = action => MAP[action][0];
  const NAMES = { Mouse0: 'Left click', Mouse1: 'Middle click', Mouse2: 'Right click', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5',
    Space: 'Space', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'L-Alt', AltRight: 'R-Alt',
    Enter: 'Enter', NumpadEnter: 'Num Enter', Tab: 'Tab', Backquote: '`', CapsLock: 'Caps Lock', Backspace: 'Backspace',
    ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
    Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\' };
  I.codeName = c => NAMES[c] || (c || '?').replace(/^Key|^Digit/, '').replace(/^Numpad/, 'Num ');
  I.keyName = action => I.codeName(MAP[action][0]);
  // next key or mouse button goes to cb (Escape cancels with null); swallows the event so nothing else reacts
  I.capture = cb => {
    const done = (e, code) => {
      e.preventDefault(); e.stopImmediatePropagation();
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onMouse, true);
      setTimeout(() => cb(code), 0);
    };
    const onKey = e => done(e, e.code === 'Escape' ? null : e.code);
    const onMouse = e => done(e, 'Mouse' + e.button);
    setTimeout(() => {
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('mousedown', onMouse, true);
    }, 0);
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
