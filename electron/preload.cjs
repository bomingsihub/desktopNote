const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopNote", {
  invoke: (channel, payload) => ipcRenderer.invoke(channel, payload),
  on: (channel, listener) => {
    const wrapped = (_event, payload) => listener(payload);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.off(channel, wrapped);
  },
  windowId: () => ipcRenderer.sendSync("window_id"),
});
