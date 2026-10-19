import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  net,
  protocol,
  session,
  shell,
} from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  applyCommand,
  check,
  correctionImpact,
  getMatch,
  getPhase,
  id,
  now,
} from "../src/domain/engine";
import type { Command, Recent, Session, Tournament } from "../src/domain/types";
import { atomicWrite, decode, PackageStore } from "./store";
import { makeSheet } from "./pdf";
let win: BrowserWindow;
let active: PackageStore | undefined;
let queue = Promise.resolve();
let allowClose = false;
const root = app.getAppPath();
const fonts = path.join(root, "assets", "fonts");
protocol.registerSchemesAsPrivileged([
  {
    scheme: "volley",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
const recentsFile = () => path.join(app.getPath("userData"), "recents.json");
async function recents(): Promise<Recent[]> {
  try {
    return JSON.parse(await fs.readFile(recentsFile(), "utf8"));
  } catch {
    return [];
  }
}
async function remember() {
  if (active)
    await atomicWrite(
      recentsFile(),
      JSON.stringify(
        [
          { name: active.current.name, path: active.folder, at: now() },
          ...(await recents()).filter((r) => r.path !== active!.folder),
        ].slice(0, 12),
      ),
    );
}
const sessionValue = (): Session | null =>
  active ? { tournament: active.current, path: active.folder } : null;
function requireActive(packageId?: string) {
  check(active, "Ouvrez d’abord un tournoi.");
  if (packageId)
    check(
      active.current.id === packageId,
      "Le tournoi actif a changé. Cette modification a été annulée.",
    );
  return active;
}
async function switchTo(next: PackageStore) {
  const old = active;
  try {
    await old?.close();
  } catch (e) {
    await next.close();
    throw e;
  }
  active = next;
  win?.setTitle(`${next.current.name} — Open Volleyball`);
  let warning: string | undefined;
  try {
    await remember();
  } catch {
    warning =
      "Tournoi ouvert, mais la liste des récents n’a pas pu être mise à jour.";
  }
  return { ...sessionValue()!, warning };
}
async function documentFor(documentId: string) {
  const store = requireActive();
  const d = store.current.documents.find((x) => x.id === documentId);
  check(d, "Le document n’est plus associé au tournoi actif.");
  const file = store.documentPath(d.file);
  await fs.access(file).catch(() => {
    throw new Error(
      "La feuille est absente. Utilisez « Réparer les feuilles manquantes » dans Exports et diagnostic.",
    );
  });
  return file;
}
async function generateDocuments(
  t: Tournament,
  store: PackageStore,
): Promise<Tournament> {
  const next = structuredClone(t);
  for (const p of next.phases.filter(
    (p) => p.status !== "Préparation" && p.kind === "groups",
  ))
    for (const g of p.groups) {
      const d = next.documents.find((x) => x.groupId === g.id);
      if (d) {
        try {
          await fs.access(store.documentPath(d.file));
          continue;
        } catch {
          next.documents = next.documents.filter((x) => x.id !== d.id);
        }
      }
      next.documents.push(await makeSheet(next, p, store.folder, fonts, g));
    }
  return next;
}
async function handle(method: string, a: any) {
  switch (method) {
    case "session":
      return sessionValue();
    case "recents":
      return recents();
    case "remove-recent":
      await atomicWrite(
        recentsFile(),
        JSON.stringify((await recents()).filter((r) => r.path !== a.path)),
      );
      return recents();
    case "choose-destination": {
      const r = await dialog.showOpenDialog(win, {
        title: "Destination du nouveau package",
        properties: ["openDirectory", "createDirectory"],
      });
      return r.canceled ? null : r.filePaths[0];
    }
    case "create":
      return switchTo(await PackageStore.create(a.parent, a.name));
    case "open": {
      let folder = a?.path;
      if (!folder) {
        const r = await dialog.showOpenDialog(win, {
          title: "Ouvrir un package .openvolley existant",
          properties: ["openDirectory"],
        });
        if (r.canceled) return null;
        folder = r.filePaths[0];
      }
      if (active && path.resolve(active.folder) === path.resolve(folder))
        return sessionValue();
      return switchTo(await PackageStore.open(folder));
    }
    case "command": {
      const store = requireActive(a.packageId);
      check(
        a.revision === store.current.revision,
        "Une modification plus récente existe. Rechargez la vue.",
      );
      let next = applyCommand(store.current, a.command as Command);
      if (next === store.current) return sessionValue();
      if (a.command.type === "confirm" || a.command.type === "match-details")
        next = await generateDocuments(next, store);
      await store.save(next);
      return sessionValue();
    }
    case "impact": {
      const store = requireActive(a.packageId);
      const impact = correctionImpact(store.current, a.phaseId, a.matchId);
      return {
        phases: impact.phases.map(
          (p) =>
            `${p.lane} · ${p.kind === "groups" ? `Groupes ${p.number}` : "Phase finale"}`,
        ),
        matches: impact.matches.length,
        splits: impact.splits.length,
      };
    }
    case "printers":
      return win.webContents.getPrintersAsync();
    case "view-document": {
      const error = await shell.openPath(await documentFor(a.id));
      check(!error, error);
      return true;
    }
    case "print-document": {
      const file = await documentFor(a.id);
      const preview = new BrowserWindow({
        show: true,
        width: 900,
        height: 800,
        title: "Imprimer la feuille",
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });
      await preview.loadURL(pathToFileURL(file).href);
      await new Promise<void>((resolve, reject) =>
        preview.webContents.print(
          {
            silent: false,
            deviceName: a.printer || "",
            printBackground: false,
          },
          (ok, reason) => {
            if (ok || reason === "cancelled") resolve();
            else reject(new Error(`Impression : ${reason}`));
          },
        ),
      );
      preview.close();
      return true;
    }
    case "sheet": {
      const store = requireActive(a.packageId),
        t = structuredClone(store.current),
        p = getPhase(t, a.phaseId),
        m = getMatch(p, a.matchId);
      const d = await makeSheet(t, p, store.folder, fonts, undefined, m);
      t.documents = t.documents.filter((x) => x.matchId !== m.id);
      t.documents.push(d);
      t.revision++;
      t.modifiedAt = now();
      t.audit.push({
        id: id(),
        at: now(),
        revision: t.revision,
        action: "sheet",
        detail: { matchId: m.id },
      });
      await store.save(t);
      return sessionValue();
    }
    case "repair-documents": {
      const store = requireActive(a.packageId);
      const t = await generateDocuments(store.current, store);
      t.revision++;
      t.modifiedAt = now();
      t.audit.push({
        id: id(),
        at: now(),
        revision: t.revision,
        action: "repair-documents",
        detail: {},
      });
      await store.save(t);
      return sessionValue();
    }
    case "show-documents": {
      const store = requireActive();
      const error = await shell.openPath(path.join(store.folder, "documents"));
      check(!error, error);
      return true;
    }
    case "export-diagnostic": {
      const store = requireActive();
      const file = path.join(store.folder, "diagnostic.json");
      await atomicWrite(
        file,
        JSON.stringify(
          {
            app: app.getVersion(),
            package: store.folder,
            revision: store.current.revision,
            teams: store.current.teams.length,
            phases: store.current.phases.map((p) => ({
              id: p.id,
              lane: p.lane,
              status: p.status,
              matches: p.matches.length,
              played: p.matches.filter((m) => m.score).length,
            })),
            audit: store.current.audit,
          },
          null,
          2,
        ),
      );
      shell.showItemInFolder(file);
      return true;
    }
    case "restore-copy": {
      const r = await dialog.showOpenDialog(win, {
        title: "Restaurer une sauvegarde dans un nouveau package",
        properties: ["openFile"],
        filters: [{ name: "Sauvegarde Open Volleyball", extensions: ["json"] }],
      });
      if (r.canceled) return null;
      const old = decode(await fs.readFile(r.filePaths[0], "utf8"));
      const dest = await dialog.showOpenDialog(win, {
        title: "Destination de la copie restaurée",
        properties: ["openDirectory", "createDirectory"],
      });
      if (dest.canceled) return null;
      const store = await PackageStore.create(
        dest.filePaths[0],
        `${old.name} - restauration ${Date.now()}`,
      );
      try {
        const t = structuredClone(old);
        t.id = store.current.id;
        t.name = store.current.name;
        t.revision = 1;
        t.modifiedAt = now();
        t.documents = [];
        t.audit.push({
          id: id(),
          at: now(),
          revision: 1,
          action: "restoration",
          detail: { source: r.filePaths[0], sourceId: old.id },
        });
        const repaired = await generateDocuments(t, store);
        await store.save(repaired);
        return switchTo(store);
      } catch (e) {
        await store.close();
        throw e;
      }
    }
    case "legacy-inspect": {
      const r = await dialog.showOpenDialog(win, {
        title: "Inspecter un ancien package sans le modifier",
        properties: ["openDirectory"],
      });
      if (r.canceled) return null;
      const files = await fs.readdir(r.filePaths[0]);
      return {
        path: r.filePaths[0],
        files,
        message:
          "La source n’a pas été modifiée. Aucun ancien exemple n’a été fourni pour établir une migration fidèle. Une conversion spécifique est nécessaire pour ce format.",
      };
    }
    default:
      throw new Error("Action non autorisée.");
  }
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    win?.show();
    win?.focus();
  });
  app.whenReady().then(async () => {
    protocol.handle("volley", (request) => {
      const url = new URL(request.url);
      const file = path.resolve(
        root,
        "dist",
        "." + decodeURIComponent(url.pathname),
      );
      if (
        url.host !== "app" ||
        !file.startsWith(path.resolve(root, "dist") + path.sep)
      )
        return new Response("Forbidden", { status: 403 });
      return net.fetch(pathToFileURL(file).href);
    });
    session.defaultSession.setPermissionRequestHandler(
      (_wc, _permission, callback) => callback(false),
    );
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: "Open Volleyball",
          submenu: [
            {
              label: "Agrandir",
              accelerator: "CmdOrCtrl+Plus",
              click: () =>
                win.webContents.setZoomLevel(
                  win.webContents.getZoomLevel() + 0.5,
                ),
            },
            {
              label: "Réduire",
              accelerator: "CmdOrCtrl+-",
              click: () =>
                win.webContents.setZoomLevel(
                  win.webContents.getZoomLevel() - 0.5,
                ),
            },
            {
              label: "Taille normale",
              accelerator: "CmdOrCtrl+0",
              click: () => win.webContents.setZoomLevel(0),
            },
            { type: "separator" },
            { role: "quit", label: "Quitter" },
          ],
        },
      ]),
    );
    win = new BrowserWindow({
      width: 1440,
      height: 950,
      minWidth: 900,
      minHeight: 650,
      title: "Open Volleyball",
      backgroundColor: "#f5f5ef",
      icon: path.join(root, "assets", "volleyball.png"),
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    win.on("page-title-updated", (event) => {
      event.preventDefault();
      win.setTitle(
        active ? `${active.current.name} — Open Volleyball` : "Open Volleyball",
      );
    });
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (e) => e.preventDefault());
    ipcMain.handle("volley", (event, method, args) => {
      if (event.sender !== win.webContents)
        return { ok: false, error: "Origine de la requête refusée." };
      const run = queue.then(async () => {
        try {
          return { ok: true, value: await handle(method, args) };
        } catch (e) {
          return {
            ok: false,
            error: e instanceof Error ? e.message : "Une erreur est survenue.",
          };
        }
      });
      queue = run.then(() => {});
      return run;
    });
    win.on("close", (e) => {
      if (allowClose) return;
      e.preventDefault();
      win.webContents
        .executeJavaScript('window.dispatchEvent(new Event("volley-close"))')
        .catch(() => {});
    });
    ipcMain.handle("finish-close", async (event) => {
      if (event.sender !== win.webContents) return;
      await queue;
      await active?.close();
      allowClose = true;
      win.close();
    });
    await win.loadURL("volley://app/index.html");
    const launch = process.argv.find((x) => x.startsWith("--package="));
    if (launch) {
      try {
        await switchTo(await PackageStore.open(launch.slice(10)));
        win.webContents.reload();
      } catch (e) {
        dialog.showErrorBox("Ouverture du tournoi", String(e));
      }
    }
  });
  app.on("window-all-closed", () => app.quit());
}
