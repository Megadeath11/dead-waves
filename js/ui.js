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

  const fmt = (key, v) => (key === 'fov' ? String(Math.round(v)) : key === 'volume' ? Math.round(v * 100) + '%' : (+v).toFixed(2));

  // Settings rows shared by the main menu and the pause menu.
  UI.settingsPanel = () => {
    const v = UI.el('div', 'settings');
    const rows = [['Mouse sensitivity', 0.05, 1.0, 0.01, 'sens'], ['Field of view', 65, 110, 1, 'fov'], ['Volume', 0, 1, 0.01, 'volume']];
    for (const [label, min, max, step, key] of rows) {
      const r = UI.el('div', 'srow');
      r.appendChild(UI.el('span', 'slabel', label));
      const s = UI.el('input', 'slider');
      Object.assign(s, { type: 'range', min, max, step, value: DW.settings[key] });
      const val = UI.el('span', 'sval dim', fmt(key, DW.settings[key]));
      s.addEventListener('input', () => {
        DW.settings[key] = +s.value;
        val.textContent = fmt(key, s.value);
        DW.applySettings();
        DW.saveSettings();
      });
      r.appendChild(s);
      r.appendChild(val);
      v.appendChild(r);
    }
    const fs = UI.el('label', 'check');
    const cb = UI.el('input');
    cb.type = 'checkbox';
    cb.checked = !!DW.settings.fullscreen;
    cb.addEventListener('change', () => {
      DW.settings.fullscreen = cb.checked;
      DW.applySettings();
      DW.saveSettings();
    });
    fs.appendChild(cb);
    fs.appendChild(document.createTextNode(' Fullscreen  (F11)'));
    v.appendChild(fs);
    return v;
  };
})();
