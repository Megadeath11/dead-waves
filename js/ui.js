// Small DOM toolkit used by the menus and the HUD.
'use strict';
(function () {
  const UI = DW.UI = {};
  UI.rgb = c => DW.css(c);
  UI.mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  UI.esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  UI.el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  UI.button = (text, cb, cls = '') => {
    const b = UI.el('button', 'btn ' + cls, text);
    b.addEventListener('click', e => {
      e.stopPropagation();
      if (b.disabled) return;
      DW.Sfx.play('hit', -10, 0.6);
      cb(e);
    });
    b.addEventListener('mouseenter', () => { if (!b.disabled) DW.Sfx.play('step', -20, 1.8); });
    return b;
  };
  UI.select = (items, selected, cb) => {
    const s = UI.el('select', 'sel');
    items.forEach((it, i) => {
      const o = UI.el('option', '', it);
      o.value = i;
      s.appendChild(o);
    });
    s.value = selected;
    s.addEventListener('change', () => cb(+s.value));
    return s;
  };

  const pct = v => Math.round(v * 100) + '%';
  const GFX_KEYS = ['renderScale', 'shadows', 'aa', 'lights', 'particles'];
  const KEY_ROWS = [
    ['move_forward', 'Move forward'], ['move_back', 'Move back'], ['move_left', 'Move left'], ['move_right', 'Move right'],
    ['jump', 'Jump'], ['sprint', 'Sprint'], ['crouch', 'Crouch'], ['fire', 'Fire'], ['ads', 'Aim down sights'],
    ['reload', 'Reload'], ['interact', 'Use / buy / revive'], ['melee', 'Knife'], ['grenade', 'Grenade'],
    ['weapon_1', 'Weapon 1'], ['weapon_2', 'Weapon 2'], ['weapon_3', 'Wind charge'], ['weapon_4', 'Weapon 4 (Mule Kick)'],
    ['swap', 'Swap weapon'], ['sentry', 'Place sentry'], ['scoreboard', 'Scoreboard'], ['skip', 'Skip intermission'],
  ];
  const TABS = [
    ['graphics', 'Graphics', ['quality', 'renderScale', 'shadows', 'aa', 'lights', 'particles', 'brightness', 'fov', 'fpsCap', 'showFps', 'fullscreen']],
    ['audio', 'Audio', ['volume', 'music', 'sfx', 'muteUnfocused']],
    ['controls', 'Controls', ['sens', 'adsSens', 'invertY', 'toggleAds', 'toggleCrouch']],
    ['keys', 'Key bindings', ['binds']],
    ['hud', 'HUD & view', ['xhColor', 'xhSize', 'hitmarkers', 'popups', 'hudScale', 'bob', 'shake']],
  ];
  UI.settingsTab = 'graphics';

  const save = () => { DW.applySettings(); DW.saveSettings(); };
  // a graphics option moved by hand: show the matching preset, or Custom
  const syncQuality = () => {
    const st = DW.settings;
    const i = DW.QUALITY_PRESETS.findIndex(p => GFX_KEYS.every(k => p[k] === st[k]));
    st.quality = i < 0 ? 4 : i;
  };

  // Tabbed settings shared by the main menu and the pause menu.
  UI.settingsPanel = () => {
    const root = UI.el('div', 'settings');
    const tabs = UI.el('div', 'stabs');
    const body = UI.el('div', 'sbody');
    root.appendChild(tabs);
    root.appendChild(body);
    const st = () => DW.settings;
    const click = (b, fn) => b.addEventListener('click', e => { e.stopPropagation(); DW.Sfx.play('hit', -14, 1.2); fn(); });

    const row = (label, hint) => {
      const r = UI.el('div', 'srow');
      const l = UI.el('div', 'slabel', label);
      if (hint) l.appendChild(UI.el('span', 'shint', hint));
      r.appendChild(l);
      body.appendChild(r);
      return r;
    };
    const slider = (label, key, min, max, step, fmt, hint, after) => {
      const r = row(label, hint);
      const s = UI.el('input', 'slider');
      Object.assign(s, { type: 'range', min, max, step, value: st()[key] });
      const val = UI.el('span', 'sval', fmt(st()[key]));
      const paint = () => s.style.setProperty('--p', ((s.value - min) / (max - min) * 100) + '%');
      paint();
      s.addEventListener('input', () => {
        st()[key] = +s.value;
        val.textContent = fmt(+s.value);
        paint();
        if (after) after();
        save();
      });
      r.appendChild(s);
      r.appendChild(val);
    };
    const toggle = (label, key, hint, after) => {
      const r = row(label, hint);
      const b = UI.el('button', 'tgl');
      const paint = () => { b.classList.toggle('on', !!st()[key]); b.textContent = st()[key] ? 'ON' : 'OFF'; };
      paint();
      click(b, () => {
        st()[key] = !st()[key];
        paint();
        if (after) after();
        save();
      });
      r.appendChild(b);
    };
    // segmented buttons; opts = [[label, value], ...]
    const choice = (label, key, opts, hint, after) => {
      const r = row(label, hint);
      const g = UI.el('div', 'seg');
      const btns = opts.map(([text, value]) => {
        const b = UI.el('button', 'segb', text);
        click(b, () => {
          st()[key] = value;
          if (after) after();
          save();
          paint();
        });
        g.appendChild(b);
        return [b, value];
      });
      const paint = () => btns.forEach(([b, v]) => b.classList.toggle('on', st()[key] === v));
      paint();
      r.appendChild(g);
    };

    const show = id => {
      UI.settingsTab = id;
      body.innerHTML = '';
      for (const b of tabs.children) b.classList.toggle('on', b.dataset.id === id);
      if (id === 'graphics') {
        const custom = () => { syncQuality(); setTimeout(() => show('graphics'), 0); };
        choice('Quality preset', 'quality', [['Low', 0], ['Medium', 1], ['High', 2], ['Ultra', 3], ['Custom', 4]], '', () => {
          const p = DW.QUALITY_PRESETS[st().quality];
          if (p) Object.assign(st(), p);
          setTimeout(() => show('graphics'), 0);
        });
        slider('Render resolution', 'renderScale', 0.5, 1.5, 0.05, pct, 'lower = more FPS', syncQuality);
        choice('Shadows', 'shadows', [['Off', 0], ['Low', 1], ['High', 2], ['Ultra', 3]], '', custom);
        choice('Lamp lights', 'lights', [['2', 2], ['4', 4], ['6', 6], ['8', 8]], 'next match', custom);
        choice('Particles', 'particles', [['Low', 0], ['Normal', 1], ['High', 2]], 'blood, sparks, debris', custom);
        toggle('Anti-aliasing', 'aa', 'after restart', custom);
        slider('Brightness', 'brightness', 0.6, 1.6, 0.05, pct);
        slider('Field of view', 'fov', 65, 110, 1, v => String(Math.round(v)));
        choice('FPS limit', 'fpsCap', [['30', 30], ['60', 60], ['120', 120], ['144', 144], ['240', 240], ['Off', 0]]);
        toggle('Show FPS', 'showFps');
        toggle('Fullscreen', 'fullscreen', 'F11');
      } else if (id === 'audio') {
        slider('Master volume', 'volume', 0, 1, 0.01, pct);
        slider('Music', 'music', 0, 1, 0.01, pct);
        slider('Effects', 'sfx', 0, 1, 0.01, pct);
        toggle('Mute when alt-tabbed', 'muteUnfocused');
      } else if (id === 'controls') {
        slider('Mouse sensitivity', 'sens', 0.05, 1.0, 0.01, v => (+v).toFixed(2));
        slider('Aim sensitivity', 'adsSens', 0.3, 1.5, 0.05, pct, 'while aiming down sights');
        toggle('Invert mouse Y', 'invertY');
        toggle('Toggle aim', 'toggleAds', 'click once instead of holding');
        toggle('Toggle crouch', 'toggleCrouch', 'press once instead of holding');
      } else if (id === 'keys') {
        const grid = UI.el('div', 'keygrid');
        for (const [action, label] of KEY_ROWS) {
          const r = UI.el('div', 'keyrow');
          r.appendChild(UI.el('span', '', label));
          const b = UI.el('button', 'keyb', DW.Input.keyName(action));
          click(b, () => {
            b.textContent = 'Press a key...';
            b.classList.add('wait');
            DW.Input.capture(code => {
              if (code) { DW.Input.bind(action, code); save(); }
              show('keys');
            });
          });
          r.appendChild(b);
          grid.appendChild(r);
        }
        body.appendChild(grid);
        body.appendChild(UI.el('div', 'shint block', 'Click a key, then press the new key or mouse button (Esc cancels). Picking a key another action uses swaps the two.'));
      } else if (id === 'hud') {
        choice('Crosshair colour', 'xhColor', DW.XH_COLORS.map(([n], i) => [n, i]));
        slider('Crosshair size', 'xhSize', 3, 14, 1, v => v + 'px');
        toggle('Hit markers', 'hitmarkers');
        toggle('Points popups', 'popups');
        slider('HUD size', 'hudScale', 0.7, 1.3, 0.05, pct);
        toggle('View bob', 'bob', 'camera sway while walking');
        slider('Screen shake', 'shake', 0, 1, 0.05, pct, 'explosions, bosses');
      }
      const reset = UI.el('button', 'sreset', 'Reset this tab to defaults');
      click(reset, () => {
        DW.resetSettings(TABS.find(t => t[0] === id)[2]);
        show(id);
      });
      body.appendChild(reset);
    };
    for (const [id, label] of TABS) {
      const b = UI.el('button', 'stab', label);
      b.dataset.id = id;
      click(b, () => show(id));
      tabs.appendChild(b);
    }
    show(UI.settingsTab);
    return root;
  };
})();
