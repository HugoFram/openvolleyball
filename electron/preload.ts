import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("volley", {
  call: (method: string, args: unknown) =>
    method === "finish-close"
      ? ipcRenderer.invoke("finish-close")
      : ipcRenderer.invoke("volley", method, args),
});
