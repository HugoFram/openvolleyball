import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("printBridge", {
  source: () => ipcRenderer.invoke("print-source"),
  complete: (result: { pages?: number; error?: string }) =>
    ipcRenderer.send("print-ready", result),
});
