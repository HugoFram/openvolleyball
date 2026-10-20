import fs from "node:fs/promises";
import path from "node:path";
import { check } from "../src/domain/engine";
import { levelLetter } from "../src/domain/levels";
import type { Tournament } from "../src/domain/types";
import { atomicWrite, decode, encode, type PackageStore } from "./store";

export function exportStem(name: string) {
  return (
    name
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
      .replace(/[. ]+$/, "")
      .slice(0, 90)
      .trim() || "Tournoi"
  );
}

export function playersCsv(t: Tournament): Buffer {
  const rows = [
    ["Nom du joueur", "Nom de l’équipe", "Niveau", "E-mail", "Club"],
    ...t.teams.flatMap((team) =>
      team.players.map((player) => [
        player.name,
        team.name,
        levelLetter(player.level),
        player.email,
        player.club,
      ]),
    ),
  ];
  // UTF-8 BOM and semicolons allow French Excel to open accents and columns directly.
  const csv = rows
    .map((row) =>
      row.map((value) => `"${value.replaceAll('"', '""')}"`).join(";"),
    )
    .join("\r\n");
  return Buffer.from("\uFEFF" + csv + "\r\n", "utf8");
}

function within(folder: string, file: string) {
  const relative = path.relative(folder, file);
  return (
    !relative ||
    (!path.isAbsolute(relative) &&
      relative !== ".." &&
      !relative.startsWith(".." + path.sep))
  );
}

/** Called inside the main process mutation queue: JSON, PDFs, history and scans
 * belong to the same saved revision. Publish the folder only after a full copy. */
export async function snapshotTournament(
  store: PackageStore,
  destination: string,
  backupName?: string,
) {
  const source = await fs.realpath(store.folder);
  const parent = await fs.realpath(destination);
  check(
    (await fs.stat(parent)).isDirectory(),
    "Choisissez un dossier de destination.",
  );
  check(
    !within(source, parent),
    "Choisissez une destination en dehors du dossier du tournoi.",
  );
  if (backupName !== undefined)
    check(
      !!backupName.trim() &&
        backupName === backupName.trim() &&
        !/[<>:"/\\|?*\x00-\x1f]/.test(backupName) &&
        ![".", ".."].includes(backupName),
      "Choisissez un nom de backup valide.",
    );
  const staging = await fs.mkdtemp(
    path.join(parent, ".openvolleyball-snapshot-"),
  );
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const name =
    backupName ??
    `${exportStem(store.current.name)} - backup ${stamp}-${path.basename(staging).slice(-6)}`;
  const target = path.join(
    parent,
    name.toLowerCase().endsWith(".openvolley") ? name : name + ".openvolley",
  );
  check(
    path.dirname(staging) === parent && path.dirname(target) === parent,
    "Destination hors du dossier choisi.",
  );
  async function copyFolder(from: string, to: string, top = false) {
    for (const entry of await fs.readdir(from, { withFileTypes: true })) {
      if (
        top &&
        [".openvolleyball.lock", "tournament.json"].includes(entry.name)
      )
        continue;
      check(
        !entry.isSymbolicLink(),
        "Le dossier contient un lien symbolique. Remplacez-le par ses fichiers avant de créer le backup.",
      );
      const input = path.join(from, entry.name),
        output = path.join(to, entry.name);
      if (entry.isDirectory()) {
        await fs.mkdir(output);
        await copyFolder(input, output);
      } else {
        check(
          entry.isFile(),
          "Le dossier contient un fichier non pris en charge.",
        );
        await fs.copyFile(input, output);
      }
    }
  }
  try {
    check(
      !(await fs.lstat(target).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      })),
      "Un backup ou un fichier de ce nom existe déjà. Choisissez un autre nom.",
    );
    await copyFolder(source, staging, true);
    const raw = encode(store.current);
    decode(raw);
    // Fail visibly instead of silently creating a snapshot without linked files.
    for (const file of new Set([
      ...store.current.documents.map((d) => d.file),
      ...(store.current.scanSources || []).map((s) => s.file),
      ...(store.current.scanPages || []).map((s) => s.image),
    ])) {
      const resolved = path.resolve(staging, file);
      check(
        within(staging, resolved),
        "Référence de fichier invalide dans le tournoi.",
      );
      await fs.access(resolved).catch(() => {
        throw Error(`Backup impossible : fichier manquant (${file}).`);
      });
    }
    await atomicWrite(path.join(staging, "tournament.json"), raw);
    // Never merge with or overwrite an existing backup, including a chosen name.
    check(
      !(await fs.stat(target).catch(() => null)),
      "Cette destination existe déjà.",
    );
    await fs.rename(staging, target);
    return target;
  } catch (error) {
    // Only the unique staging directory created above can be removed.
    check(
      path.dirname(staging) === parent &&
        path.basename(staging).startsWith(".openvolleyball-snapshot-"),
      "Nettoyage hors du dossier choisi refusé.",
    );
    await fs.rm(staging, { recursive: true, force: true });
    throw error;
  }
}
