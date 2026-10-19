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
  nativeImage,
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
  normalizeWebsite,
} from "../src/domain/engine";
import type { Command, Recent, Session, Tournament } from "../src/domain/types";
import { atomicWrite, decode, PackageStore } from "./store";
import { makeSheet, sheetFingerprint } from "./pdf";
import { makeRegistrationSheet } from "./registration-pdf";
import { printDocument } from "./printing";
import { scanAction } from "./scans";
import { currentForm, scoreFixtureKey } from "../src/domain/scans";
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
  try {
    const refreshed = await generateDocuments(next.current, next);
    if (
      JSON.stringify(refreshed.documents) !==
      JSON.stringify(next.current.documents)
    ) {
      refreshed.revision++;
      refreshed.modifiedAt = now();
      refreshed.audit.push({
        id: id(),
        at: now(),
        revision: refreshed.revision,
        action: "documents-updated",
        detail: { layout: 6 },
      });
      await next.save(refreshed);
    }
  } catch (error) {
    await next.close();
    throw error;
  }
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
  // Certify existing templates before a layout-only refresh removes their PDF
  // associations. Old printouts remain usable only for exactly the same fixtures.
  for (const form of next.paperForms || [])
    if (form.kind === "scores" && !form.fixtureKey) {
      try {
        currentForm(next, form.id);
        form.fixtureKey = scoreFixtureKey(next, form);
      } catch {}
    }
  for (const p of next.phases.filter((p) => p.status !== "Préparation"))
    for (const item of p.kind === "groups" ? p.groups : p.matches) {
      const g =
        p.kind === "groups"
          ? (item as import("../src/domain/types").Group)
          : undefined;
      const m =
        p.kind === "knockout"
          ? (item as import("../src/domain/types").Match)
          : undefined;
      const d = next.documents.find((x) =>
        g ? x.groupId === g.id : x.matchId === m!.id,
      );
      if (d && d.sourceHash === sheetFingerprint(next, p, g, m)) {
        try {
          await fs.access(store.documentPath(d.file));
          continue;
        } catch {}
      }
      if (d) next.documents = next.documents.filter((x) => x.id !== d.id);
      const made = await makeSheet(next, p, store.folder, fonts, g, m);
      next.documents.push(made);
      (next.paperForms ??= []).push(...(made.forms || []));
      next.schema = 2;
    }
  return next;
}
async function logoData(file: string): Promise<string> {
  const raw = await fs.readFile(file);
  check(raw.length <= 8 * 1024 * 1024, "Le logo doit faire moins de 8 Mo.");
  const image = nativeImage.createFromBuffer(raw);
  check(!image.isEmpty(), "Choisissez un logo PNG ou JPEG valide.");
  const { width, height } = image.getSize();
  const scale = Math.min(1, 512 / Math.max(width, height));
  const png = image
    .resize({
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    })
    .toPNG();
  check(
    png.length <= 1000000,
    "Le logo est trop volumineux. Choisissez une image plus simple.",
  );
  return `data:image/png;base64,${png.toString("base64")}`;
}
async function handle(method: string, a: any) {
  if (method.startsWith("scan-")) {
    const store = requireActive(a?.packageId);
    if (method !== "scan-source" && method !== "scan-image")
      check(
        a.revision === store.current.revision,
        "Le tournoi a changé. Réessayez depuis la vue actuelle.",
      );
    const result = await scanAction(method, a, store, win, generateDocuments);
    return result === true ? sessionValue() : result;
  }
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
        title: "Destination du nouveau tournoi",
        properties: ["openDirectory", "createDirectory"],
      });
      return r.canceled ? null : r.filePaths[0];
    }
    case "choose-logo": {
      const r = await dialog.showOpenDialog(win, {
        title: "Choisir le logo du tournoi",
        properties: ["openFile"],
        filters: [
          { name: "Images PNG ou JPEG", extensions: ["png", "jpg", "jpeg"] },
        ],
      });
      if (r.canceled) return null;
      await logoData(r.filePaths[0]);
      return r.filePaths[0];
    }
    case "create": {
      const branding = {
        website: normalizeWebsite(a.website),
        logo: a.logoPath ? await logoData(a.logoPath) : undefined,
      };
      return switchTo(
        await PackageStore.create(
          a.parent,
          a.name,
          branding.website || branding.logo ? branding : undefined,
        ),
      );
    }
    case "open": {
      let folder = a?.path;
      if (!folder) {
        const r = await dialog.showOpenDialog(win, {
          title: "Ouvrir un tournoi .openvolley existant",
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
      if (
        [
          "confirm",
          "knockout",
          "score",
          "random",
          "match-details",
          "bracket-swap",
        ].includes(a.command.type)
      )
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
      return printDocument(
        file,
        a.printer || "",
        root,
        path.join(__dirname, "print-preload.cjs"),
        win,
      );
    }
    case "registration-sheet": {
      const store = requireActive(a.packageId),
        t = structuredClone(store.current);
      const team = a.teamId
        ? t.teams.find((x) => x.id === a.teamId)
        : undefined;
      check(!a.teamId || team, "Équipe introuvable.");
      check(
        ["Hommes", "Femmes"].includes(a.category || team?.category),
        "Catégorie invalide.",
      );
      t.revision++;
      t.modifiedAt = now();
      const d = await makeRegistrationSheet(
        t,
        store.folder,
        fonts,
        team?.category || a.category,
        a.perPage || 1,
        a.pages || 1,
        team,
      );
      t.documents.push(d);
      (t.paperForms ??= []).push(...(d.forms || []));
      t.schema = 2;
      t.audit.push({
        id: id(),
        at: now(),
        revision: t.revision,
        action: "registration-sheet",
        detail: {
          teamId: team?.id,
          perPage: a.perPage || 1,
          pages: a.pages || 1,
        },
      });
      await store.save(t);
      return sessionValue();
    }
    case "sheet": {
      const store = requireActive(a.packageId),
        t = structuredClone(store.current),
        p = getPhase(t, a.phaseId),
        m = getMatch(p, a.matchId);
      const d = await makeSheet(t, p, store.folder, fonts, undefined, m);
      t.documents = t.documents.filter((x) => x.matchId !== m.id);
      t.documents.push(d);
      (t.paperForms ??= []).push(...(d.forms || []));
      t.schema = 2;
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
            tournoi: store.folder,
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
        title: "Restaurer une sauvegarde dans un nouveau tournoi",
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
        // Scan originals live alongside a tournament, not inside its JSON.
        // Carry them into a restoration when the selected backup has them.
        const backupFolder = path.dirname(r.filePaths[0]);
        const originalFolder =
          path.basename(backupFolder) === "history"
            ? path.dirname(backupFolder)
            : backupFolder;
        if (t.scanSources?.length) {
          await fs.mkdir(path.join(store.folder, "scans"), { recursive: true });
          const files = new Set([
            ...(t.scanSources || []).map((s) => s.file),
            ...(t.scanPages || []).map((s) => s.image),
          ]);
          for (const file of files) {
            check(
              /^scans\/[a-zA-Z0-9.-]+$/.test(file),
              "Chemin de scan invalide.",
            );
            await fs
              .copyFile(
                path.join(originalFolder, file),
                path.join(store.folder, file),
              )
              .catch(() => {});
          }
          for (const source of t.scanSources) {
            source.processed = true;
            try {
              await fs.access(path.join(store.folder, source.file));
            } catch {
              source.error =
                "Original absent de la sauvegarde JSON. Retrouvez-le dans le dossier scans du tournoi source.";
            }
          }
          for (const scan of t.scanPages || [])
            if (scan.status === "pending") {
              scan.status = "ignored";
              scan.note =
                "Copie restaurée : feuille de l’ancien tournoi conservée pour consultation. Utilisez les nouvelles feuilles pour importer des résultats.";
            }
        }
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
        title: "Inspecter un ancien tournoi sans le modifier",
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
      backgroundColor: "#f1f5fa",
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
    const launch = process.argv.find(
      (x) => x.startsWith("--package=") || x.startsWith("--tournoi="),
    );
    if (launch) {
      try {
        await switchTo(
          await PackageStore.open(launch.slice(launch.indexOf("=") + 1)),
        );
        win.webContents.reload();
      } catch (e) {
        dialog.showErrorBox("Ouverture du tournoi", String(e));
      }
    }
  });
  app.on("window-all-closed", () => app.quit());
}
