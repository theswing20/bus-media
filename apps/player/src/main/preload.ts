import { contextBridge, ipcRenderer } from "electron";

const on = (ch: string) => (cb: (x: any) => void) => {
  const h = (_e: unknown, x: any) => cb(x);
  ipcRenderer.on(ch, h);
  return () => ipcRenderer.removeListener(ch, h);
};

contextBridge.exposeInMainWorld("player", {
  getManifest: () => ipcRenderer.invoke("getManifest"),
  localUrl: (u: string) => ipcRenderer.invoke("localUrl", u),
  onManifest: on("manifest"),
  onGps: on("gps"),
  onStopEvent: on("stop-event"),
  reportImpression: (i: unknown) => ipcRenderer.send("impression", i),
  log: (level: string, msg: string) => ipcRenderer.send("log", level, msg),
});
