// Steam lobbies + P2P messages (through the Electron bridge, window.steam). The lobby owner is the
// host: it simulates zombies and waves; everyone simulates their own player.
// Packets: byte 0 = 0 then UTF-8 JSON [type, data], or byte 0 = 1 then float32s (zombie snapshot).
// Without Steam, ?fake=1001 in the URL uses a BroadcastChannel between browser tabs instead.
'use strict';
(function () {
  const Net = DW.Net = {};
  const listeners = {};
  Net.on = (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); };
  Net.off = (ev, fn) => { listeners[ev] = (listeners[ev] || []).filter(f => f !== fn); };
  const emit = (ev, ...args) => { for (const fn of (listeners[ev] || []).slice()) { try { fn(...args); } catch (e) { console.error(e); } } };

  Net.backend = null;
  Net.steamOk = false;
  Net.status = 'Steam not connected - solo only';
  Net.myId = 'local';
  Net.myName = 'Survivor';
  Net.lobbyId = '';
  Net.hostId = '';
  Net.members = []; // [{id, name}]
  Net.names = {};
  Net.inMatch = false;
  let api = null;

  const utf8e = new TextEncoder(), utf8d = new TextDecoder();
  const ST_CODES = ['intermission', 'wave', 'over'];

  function encode(type, data) {
    if (type === 'zs') {
      const a = data.a;
      const f = new Float32Array(3 + a.length);
      f[0] = data.w; f[1] = Math.max(0, ST_CODES.indexOf(data.st)); f[2] = data.t;
      f.set(a, 3);
      const out = new Uint8Array(4 + f.byteLength);
      out[0] = 1;
      out.set(new Uint8Array(f.buffer), 4);
      return out;
    }
    const body = utf8e.encode(JSON.stringify([type, data === undefined ? null : data]));
    const out = new Uint8Array(body.length + 1);
    out.set(body, 1);
    return out;
  }
  function decode(bytes) {
    if (!bytes || !bytes.length) return null;
    if (bytes[0] === 1) {
      const copy = bytes.slice(4);
      const f = new Float32Array(copy.buffer, copy.byteOffset, copy.byteLength >> 2);
      return ['zs', { w: f[0], st: ST_CODES[f[1] | 0] || 'wave', t: f[2], a: f.subarray(3) }];
    }
    try {
      const m = JSON.parse(utf8d.decode(bytes.subarray(1)));
      return Array.isArray(m) && m.length === 2 && typeof m[0] === 'string' ? m : null;
    } catch (e) { return null; }
  }

  Net.isOnline = () => Net.lobbyId !== '';
  Net.isHost = () => Net.lobbyId === '' || Net.hostId === Net.myId;
  Net.memberIds = () => (Net.members.length ? Net.members.map(m => m.id) : [Net.myId]);
  Net.persona = id => (id === Net.myId ? Net.myName : Net.names[id] || 'Player ' + String(id).slice(-4));

  // ---------------------------------------------------------------- backends

  function fakeBackend(id) {
    const bc = new BroadcastChannel('dw-fake');
    const KEY = 'dw.fake.lobby';
    const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
    const save = l => { if (l) localStorage.setItem(KEY, JSON.stringify(l)); else localStorage.removeItem(KEY); };
    let lobbyCb = null, pktCb = null, inLobby = false;
    const info = () => { const l = load(); return inLobby && l && l.members.includes(id) ? { id: l.id, owner: l.owner, members: l.members, data: l.data } : null; };
    const announce = (changed, state) => bc.postMessage({ k: 'lobby', changed, state });
    bc.onmessage = e => {
      const m = e.data;
      if (m.k === 'lobby' && inLobby && lobbyCb) lobbyCb({ info: info(), changed: m.changed, state: m.state });
      if (m.k === 'pkt' && m.to === id && pktCb) pktCb([{ from: m.from, data: m.data }]);
    };
    const leave = () => {
      const l = load();
      if (l && l.members.includes(id)) {
        l.members = l.members.filter(x => x !== id);
        if (l.owner === id) l.owner = l.members[0];
        save(l.members.length ? l : null);
        announce(id, 1);
      }
      inLobby = false;
    };
    window.addEventListener('beforeunload', leave);
    return {
      info: async () => ({ ok: true, id, name: 'Player ' + id }),
      createLobby: async data => {
        leave();
        const l = { id: '777' + id, owner: id, members: [id], data: Object.assign({ game: DW.GAME_TAG }, data), joinable: true };
        save(l);
        inLobby = true;
        announce(id, 0);
        return info();
      },
      joinLobby: async lid => {
        const l = load();
        if (!l || l.id !== String(lid)) throw new Error('Lobby not found.');
        if (!l.members.includes(id)) l.members.push(id);
        save(l);
        inLobby = true;
        announce(id, 0);
        return info();
      },
      leaveLobby: async () => leave(),
      lobby: async () => info(),
      setData: async data => { const l = load(); if (l) { Object.assign(l.data, data); save(l); announce('', -1); } return true; },
      setJoinable: async on => { const l = load(); if (l) { l.joinable = on; save(l); } return true; },
      invite: async () => true,
      list: async () => { const l = load(); return l ? [{ id: l.id, data: l.data, count: l.members.length }] : []; },
      send: (to, bytes) => bc.postMessage({ k: 'pkt', to, from: id, data: bytes }),
      onPackets: fn => { pktCb = fn; },
      onLobby: fn => { lobbyCb = fn; },
      onJoinRequested: () => {},
    };
  }

  Net.init = async () => {
    const fake = new URLSearchParams(location.search).get('fake');
    if (fake) { api = fakeBackend(fake); Net.backend = 'fake'; }
    else if (window.steam) { api = window.steam; Net.backend = 'steam'; }
    if (!api) { Net.status = 'Steam not connected - solo only'; return; }
    let r;
    try { r = await api.info(); } catch (e) { r = { ok: false, error: String(e) }; }
    if (!r || !r.ok) {
      api = null;
      Net.status = "Steam isn't running - solo only. Start Steam and relaunch for co-op.";
      return;
    }
    Net.steamOk = true;
    Net.myId = String(r.id);
    Net.myName = r.name || 'Survivor';
    Net.status = (Net.backend === 'fake' ? 'Fake Steam (test mode) as ' : 'Steam connected as ') + Net.myName;
    api.onPackets(onPackets);
    api.onLobby(onLobby);
    api.onJoinRequested(id => { if (!Net.inMatch) Net.joinLobby(id); });
  };

  function applyInfo(info) {
    if (!info) return false;
    Net.lobbyId = info.id;
    Net.hostId = info.owner;
    try {
      const n = JSON.parse((info.data && info.data.names) || '{}');
      for (const k in n) if (k !== Net.myId) Net.names[k] = n[k];
    } catch (e) { /* ignore */ }
    Net.members = info.members.map(id => ({ id, name: Net.persona(id) }));
    if (!Net.isHost() && info.data) {
      if (info.data.map && DW.Maps.MAPS[info.data.map]) DW.mapId = info.data.map;
      if (info.data.diff !== undefined && info.data.diff !== '') DW.diffId = DW.clamp(+info.data.diff | 0, 0, 3);
    }
    return true;
  }

  function onLobby(ev) {
    if (!Net.lobbyId) return;
    const oldHost = Net.hostId;
    if (!ev.info) return;
    applyInfo(ev.info);
    if (ev.changed && ev.state >= 1 && ev.state <= 4 && ev.changed !== Net.myId) {
      emit('player_left', ev.changed);
      if (ev.changed === oldHost && Net.inMatch) emit('host_left');
    }
    if (ev.state === 0 && ev.changed && ev.changed !== Net.myId) Net.sendTo(ev.changed, 'hello', { name: Net.myName });
    if (Net.isHost()) pushNames();
    emit('lobby_updated');
  }

  function pushNames() {
    if (!api || !Net.lobbyId || !Net.isHost()) return;
    const n = { [Net.myId]: Net.myName };
    for (const m of Net.members) if (Net.names[m.id]) n[m.id] = Net.names[m.id];
    api.setData({ names: JSON.stringify(n) });
  }

  // ---------------------------------------------------------------- lobbies

  Net.hostLobby = async () => {
    if (!api) { emit('lobby_error', "Steam isn't running, so co-op is unavailable."); return; }
    try {
      const info = await api.createLobby({ name: Net.myName + "'s game", map: DW.mapId, diff: String(DW.diffId), state: 'lobby', names: JSON.stringify({ [Net.myId]: Net.myName }) });
      applyInfo(info);
      emit('lobby_updated');
    } catch (e) { emit('lobby_error', "Couldn't create a lobby: " + (e.message || e)); }
  };
  Net.findLobbies = async () => {
    if (!api) { emit('lobby_error', "Steam isn't running."); return; }
    let list = [];
    try { list = await api.list(); } catch (e) { list = []; }
    emit('lobby_list', list.map(l => ({ id: l.id, name: l.data.name || 'Dead Waves game', map: l.data.map, diff: +l.data.diff | 0, state: l.data.state, count: l.count })));
  };
  Net.joinLobby = async id => {
    if (!api) return;
    try {
      const info = await api.joinLobby(String(id));
      applyInfo(info);
      Net.sendAll('hello', { name: Net.myName });
      emit('lobby_updated');
    } catch (e) { emit('lobby_error', "Couldn't join lobby: " + (e.message || e)); }
  };
  Net.leaveLobby = () => {
    if (!Net.lobbyId) return;
    if (api) api.leaveLobby();
    Net.lobbyId = '';
    Net.hostId = '';
    Net.members = [];
    Net.inMatch = false;
    emit('lobby_updated');
  };
  Net.inviteFriends = () => { if (api && Net.lobbyId) api.invite(); };
  Net.pushConfig = () => {
    if (!api || !Net.lobbyId || !Net.isHost()) return;
    api.setData({ map: DW.mapId, diff: String(DW.diffId), state: Net.inMatch ? 'ingame' : 'lobby' });
  };
  Net.startMatch = () => {
    const cfg = { map: DW.mapId, diff: DW.diffId, seed: Math.floor(Math.random() * 1e9), players: Net.memberIds() };
    if (Net.lobbyId) {
      Net.inMatch = true;
      api.setJoinable(false);
      Net.pushConfig();
      Net.sendAll('start', cfg);
    }
    emit('match_start', cfg);
  };
  Net.endMatch = () => {
    Net.inMatch = false;
    if (Net.lobbyId && Net.isHost()) {
      api.setJoinable(true);
      Net.pushConfig();
    }
  };

  // ---------------------------------------------------------------- messaging

  Net.sendTo = (id, type, data, reliable = true) => {
    if (!Net.lobbyId || !api || !id || id === Net.myId) return;
    api.send(id, encode(type, data), reliable);
  };
  Net.sendAll = (type, data, reliable = true) => {
    if (!Net.lobbyId || !api) return;
    const bytes = encode(type, data);
    for (const m of Net.members) if (m.id !== Net.myId) api.send(m.id, bytes, reliable);
  };
  Net.sendHost = (type, data, reliable = true) => Net.sendTo(Net.hostId, type, data, reliable);

  function onPackets(batch) {
    for (const p of batch) {
      const msg = decode(p.data instanceof Uint8Array ? p.data : new Uint8Array(p.data));
      if (!msg) continue;
      dispatch(String(p.from), msg[0], msg[1]);
    }
  }
  function dispatch(sender, type, data) {
    if (type === 'hello') {
      if (data && data.name) {
        Net.names[sender] = String(data.name).slice(0, 40);
        for (const m of Net.members) if (m.id === sender) m.name = Net.names[sender];
        if (Net.isHost()) pushNames();
      }
      emit('lobby_updated');
    } else if (type === 'start') {
      if (sender === Net.hostId && data) {
        Net.inMatch = true;
        emit('match_start', data);
      }
    } else emit('packet', sender, type, data);
  }
})();
