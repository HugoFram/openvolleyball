import fs from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
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

function playerRows(t: Tournament): string[][] {
  return [
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
}

export function playersCsv(t: Tournament, delimiter: "," | ";"): Buffer {
  check(delimiter === "," || delimiter === ";", "Séparateur CSV invalide.");
  // Quote every field and retain the UTF-8 BOM for accents in spreadsheet apps.
  const csv = playerRows(t)
    .map((row) =>
      row.map((value) => `"${value.replaceAll('"', '""')}"`).join(delimiter),
    )
    .join("\r\n");
  return Buffer.from("\uFEFF" + csv + "\r\n", "utf8");
}

export async function playersXlsx(t: Tournament): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Joueurs", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  // Strings stay literal, including names starting with '=' or '+' and emails.
  sheet.addRows(playerRows(t));
  [32, 32, 12, 40, 32].forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
    sheet.getColumn(index + 1).numFmt = "@";
  });
  sheet.eachRow((row, index) => {
    row.alignment = { vertical: "middle", wrapText: true };
    row.font = { name: "Calibri", size: 11 };
    if (index === 1) {
      row.height = 28;
      row.font = {
        name: "Calibri",
        size: 11,
        bold: true,
        color: { argb: "FFFFFFFF" },
      };
      row.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF245A81" },
        };
      });
    }
  });
  sheet.autoFilter = { from: "A1", to: "E1" };
  return Buffer.from(await workbook.xlsx.writeBuffer());
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
