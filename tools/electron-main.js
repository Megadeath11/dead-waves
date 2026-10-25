// Dead Waves desktop wrapper: one window running the game from the bundled files.
// Steam (Spacewar, AppID 480, until the game has its own): your Steam name, co-op lobbies that friends
// join through an invite, the Steam friends list or a lobby code, and P2P messages for the match itself.
const { app, BrowserWindow, Menu, shell, ipcMain, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');

const APP_ID = 480;
const GAME_TAG = 'deadwaves_v1';
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
if (process.platform === 'win32') app.setAppUserModelId('DeadWaves.Game');

// ---------------- Steam
let steamworks = null, client = null, steamError = '', lobby = null, win = null;
try {
  steamworks = require('steamworks.js');
  client = steamworks.init(APP_ID);
  steamworks.electronEnableSteamOverlay();
} catch (e) {
  client = null;
  steamError = /steam/i.test(String(e && e.message)) ? 'Steam is not running' : String(e && e.message || e);
}

// startup log for troubleshooting: %APPDATA%\Dead Waves\steam.log
app.whenReady().then(() => {
  try {
    fs.writeFileSync(path.join(app.getPath('userData'), 'steam.log'),
      `${new Date().toISOString()} steam=${client ? 'ok' : 'FAILED'} error=${steamError || '-'}\n`);
  } catch (e) { /* not important */ }
});

const sid = id => String(id);
const send = (ch, data) => { if (win && !win.isDestroyed()) win.webContents.send(ch, data); };

function members() {
  if (!lobby) return [];
  try { return lobby.getMembers().map(m => sid(m.steamId64)); } catch (e) { return []; }
}
function lobbyInfo() {
  if (!lobby) return null;
  try {
    return { id: sid(lobby.id), owner: sid(lobby.getOwner().steamId64), members: members(), data: lobby.getFullData() };
  } catch (e) { return null; }
}
function acceptAll() {
  for (const m of members()) { try { client.networking.acceptP2PSession(BigInt(m)); } catch (e) { /* gone */ } }
}
function setPresence() {
  if (!client) return;
  try {
    if (lobby) {
      client.localplayer.setRichPresence('status', 'In a Dead Waves lobby');
      client.localplayer.setRichPresence('connect', '+connect_lobby ' + sid(lobby.id));
    } else {
      client.localplayer.setRichPresence('connect', null);
      client.localplayer.setRichPresence('status', 'Playing Dead Waves');
    }
  } catch (e) { /* fine */ }
}
function leave() {
  if (lobby) { try { lobby.leave(); } catch (e) { /* gone */ } }
  lobby = null;
  setPresence();
}

let pendingJoin = null;
function requestJoin(id) {
  id = String(id);
  if (win && !win.webContents.isLoading()) send('steam:joinRequested', id); else pendingJoin = id;
}

if (client) {
  const CB = steamworks.SteamCallback;
  client.callback.register(CB.P2PSessionRequest, v => {
    if (members().includes(sid(v.remote))) client.networking.acceptP2PSession(v.remote);
  });
  client.callback.register(CB.LobbyChatUpdate, v => {
    if (!lobby || sid(v.lobby) !== sid(lobby.id)) return;
    acceptAll();
    send('steam:lobby', { info: lobbyInfo(), changed: sid(v.user_changed), state: v.member_state_change });
  });
  client.callback.register(CB.LobbyDataUpdate, v => {
    if (lobby && sid(v.lobby) === sid(lobby.id)) send('steam:lobby', { info: lobbyInfo() });
  });
  client.callback.register(CB.GameLobbyJoinRequested, v => requestJoin(v.lobby_steam_id));
  const i = process.argv.indexOf('+connect_lobby');
  if (i >= 0 && process.argv[i + 1]) pendingJoin = process.argv[i + 1];

  // pump incoming packets to the page in batches
  setInterval(() => {
    let batch = null;
    try {
      let size;
      while ((size = client.networking.isP2PPacketAvailable()) > 0) {
        const pkt = client.networking.readP2PPacket(size);
        (batch = batch || []).push({ from: sid(pkt.steamId.steamId64), data: new Uint8Array(pkt.data) });
        if (batch.length > 400) break;
      }
    } catch (e) { /* ignore a bad packet */ }
    if (batch) send('steam:packets', batch);
  }, 5);
}

ipcMain.handle('steam:info', () => {
  if (!client) return { ok: false, error: steamError || 'Steam is not running' };
  return { ok: true, id: sid(client.localplayer.getSteamId().steamId64), name: client.localplayer.getName() };
});
ipcMain.handle('steam:create', async (e, data) => {
  if (!client) throw new Error('Steam is not running.');
  leave();
  lobby = await client.matchmaking.createLobby(2 /* public */, 4);
  lobby.mergeFullData(Object.assign({ game: GAME_TAG }, clean(data)));
  setPresence();
  return lobbyInfo();
});
ipcMain.handle('steam:join', async (e, id) => {
  if (!client) throw new Error('Steam is not running.');
  id = String(id).trim();
  if (!/^\d+$/.test(id)) throw new Error('That is not a lobby code.');
  if (lobby && sid(lobby.id) === id) return lobbyInfo();
  leave();
  lobby = await client.matchmaking.joinLobby(BigInt(id));
  if (lobby.getData('game') !== GAME_TAG) { leave(); throw new Error('That lobby is not a Dead Waves game.'); }
  acceptAll();
  setPresence();
  return lobbyInfo();
});
ipcMain.handle('steam:leave', () => { leave(); return true; });
ipcMain.handle('steam:lobby', () => lobbyInfo());
ipcMain.handle('steam:setData', (e, data) => { if (lobby) { try { return lobby.mergeFullData(clean(data)); } catch (er) { /* not owner */ } } return false; });
ipcMain.handle('steam:setJoinable', (e, on) => { if (lobby) { try { lobby.setJoinable(!!on); } catch (er) { /* not owner */ } } return true; });
ipcMain.handle('steam:invite', () => {
  if (!client) return false;
  try { if (lobby) client.overlay.activateInviteDialog(lobby.id); else client.overlay.activateDialog(0); return true; } catch (e) { return false; }
});
ipcMain.handle('steam:list', async () => {
  if (!client) return [];
  const out = [];
  try {
    for (const l of await client.matchmaking.getLobbies()) {
      let d = {};
      try { d = l.getFullData(); } catch (e) { continue; }
      if (d.game !== GAME_TAG) continue;
      out.push({ id: sid(l.id), data: d, count: Number(l.getMemberCount()) });
    }
  } catch (e) { /* none */ }
  return out;
});
ipcMain.on('steam:send', (e, to, data, reliable) => {
  if (!client) return;
  try {
    const buf = Buffer.from(data);
    client.networking.sendP2PPacket(BigInt(to), reliable || buf.length > 1150 ? 2 : 0, buf);
  } catch (er) { /* peer gone */ }
});
ipcMain.handle('clip:write', (e, text) => { clipboard.writeText(String(text)); return true; });
ipcMain.handle('win:fullscreen', (e, on) => { if (win) win.setFullScreen(!!on); return true; });
ipcMain.handle('app:quit', () => { leave(); app.quit(); });

function clean(data) {
  const out = {};
  for (const [k, v] of Object.entries(data || {})) out[String(k).slice(0, 32)] = String(v).slice(0, 4000);
  return out;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 960, minHeight: 540,
    backgroundColor: '#050304', title: 'Dead Waves', autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, preload: path.join(__dirname, 'steam-preload.js') },
  });
  Menu.setApplicationMenu(null);
  // test hook: DW_QUERY="playtest&map=bunker" loads the page with that query, DW_SHOT=<file.png> saves a
  // screenshot after DW_SHOT_MS (default 8000) and quits; page console goes to <file>.log
  const query = {};
  if (process.env.DW_QUERY) for (const [k, v] of new URLSearchParams(process.env.DW_QUERY)) query[k] = v;
  win.loadFile(path.join(__dirname, 'game', 'index.html'), { query });
  if (process.env.DW_SHOT) {
    const shot = process.env.DW_SHOT;
    const lines = [];
    win.webContents.on('console-message', (e, level, message) => lines.push(`[${level}] ${message}`));
    setTimeout(async () => {
      try {
        fs.writeFileSync(shot, (await win.webContents.capturePage()).toPNG());
        fs.writeFileSync(shot + '.log', lines.join('\n'));
      } catch (er) { /* test only */ }
      app.quit();
    }, +(process.env.DW_SHOT_MS || 8000));
  }
  win.webContents.on('did-finish-load', () => { if (pendingJoin) { send('steam:joinRequested', pendingJoin); pendingJoin = null; } });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', e => e.preventDefault());
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { leave(); app.quit(); });
