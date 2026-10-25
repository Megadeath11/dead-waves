// Exposes a small Steam API to the game page (window.steam). The page has no Node access itself.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('steam', {
  info: () => ipcRenderer.invoke('steam:info'),
  createLobby: data => ipcRenderer.invoke('steam:create', data),
  joinLobby: id => ipcRenderer.invoke('steam:join', String(id)),
  leaveLobby: () => ipcRenderer.invoke('steam:leave'),
  lobby: () => ipcRenderer.invoke('steam:lobby'),
  setData: data => ipcRenderer.invoke('steam:setData', data),
  setJoinable: on => ipcRenderer.invoke('steam:setJoinable', on),
  invite: () => ipcRenderer.invoke('steam:invite'),
  list: () => ipcRenderer.invoke('steam:list'),
  send: (to, bytes, reliable) => ipcRenderer.send('steam:send', String(to), bytes, !!reliable),
  onPackets: fn => ipcRenderer.on('steam:packets', (e, batch) => fn(batch)),
  onLobby: fn => ipcRenderer.on('steam:lobby', (e, ev) => fn(ev)),
  onJoinRequested: fn => ipcRenderer.on('steam:joinRequested', (e, id) => fn(String(id))),
});

contextBridge.exposeInMainWorld('desktop', {
  copy: text => ipcRenderer.invoke('clip:write', text),
  fullscreen: on => ipcRenderer.invoke('win:fullscreen', on),
  quit: () => ipcRenderer.invoke('app:quit'),
});
