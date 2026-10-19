import { BrowserWindow, ipcMain } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
interface PrintJob {
  data: Uint8Array;
  ready: (pages: number) => void;
  fail: (error: Error) => void;
}
const jobs = new Map<number, PrintJob>();
let initialized = false;
function registerPrintBridge() {
  if (initialized) return;
  initialized = true;
  ipcMain.handle("print-source", (event) => {
    const job = jobs.get(event.sender.id);
    if (!job || event.senderFrame !== event.sender.mainFrame)
      throw new Error("Source d’impression indisponible.");
    return job.data;
  });
  ipcMain.on(
    "print-ready",
    (event, result: { pages?: number; error?: string }) => {
      const job = jobs.get(event.sender.id);
      if (!job || event.senderFrame !== event.sender.mainFrame) return;
      if (!result || typeof result !== "object")
        job.fail(new Error("Réponse d’impression invalide."));
      else if (result.error)
        job.fail(new Error(`Préparation de l’impression : ${result.error}`));
      else if (
        Number.isInteger(result.pages) &&
        result.pages! > 0 &&
        result.pages! <= 200
      )
        job.ready(result.pages!);
      else
        job.fail(new Error("Le document ne contient aucune page imprimable."));
    },
  );
}
/** The PDF plug-in is not a printable DOM. Render every page, including fonts
 * and images, before handing the prepared HTML document to Chromium printing. */
export async function preparePrintWindow(
  file: string,
  root: string,
  preload: string,
  parent?: BrowserWindow,
) {
  registerPrintBridge();
  const data = new Uint8Array(await fs.readFile(file));
  const preview = new BrowserWindow({
    show: false,
    width: 920,
    height: 900,
    title: "Open Volleyball — Imprimer",
    parent,
    icon: path.join(root, "assets", "volleyball.png"),
    backgroundColor: "#eaf0f7",
    webPreferences: {
      preload,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  preview.setMenu(null);
  preview.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  preview.webContents.on("will-navigate", (event) => event.preventDefault());
  let deadline: ReturnType<typeof setTimeout>;
  const ready = new Promise<number>((resolve, reject) => {
    jobs.set(preview.webContents.id, { data, ready: resolve, fail: reject });
    deadline = setTimeout(
      () =>
        reject(
          new Error("La préparation du document a dépassé le délai autorisé."),
        ),
      60000,
    );
    preview.once("closed", () => reject(new Error("Impression annulée.")));
    preview.webContents.once("render-process-gone", () =>
      reject(new Error("La préparation de l’impression a été interrompue.")),
    );
  });
  const jobId = preview.webContents.id;
  try {
    const [, pages] = await Promise.all([
      preview.loadURL("volley://app/print.html"),
      ready,
    ]);
    return { window: preview, pages };
  } catch (error) {
    if (!preview.isDestroyed()) preview.destroy();
    throw error;
  } finally {
    clearTimeout(deadline!);
    jobs.delete(jobId);
  }
}
export async function printDocument(
  file: string,
  printer: string,
  root: string,
  preload: string,
  parent: BrowserWindow,
) {
  const { window: preview } = await preparePrintWindow(
    file,
    root,
    preload,
    parent,
  );
  try {
    preview.show();
    await new Promise<void>((resolve, reject) => {
      preview.once("closed", resolve);
      preview.webContents.print(
        {
          silent: false,
          deviceName: printer || "",
          pageSize: "A4",
          margins: { marginType: "none" },
          printBackground: true,
        },
        (ok, reason) => {
          if (ok || reason === "cancelled") resolve();
          else reject(new Error(`Impression : ${reason}`));
        },
      );
    });
  } finally {
    if (!preview.isDestroyed()) preview.destroy();
  }
  return true;
}
