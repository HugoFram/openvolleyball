import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  assertInvariants,
  check,
  createTournament,
} from "../src/domain/engine";
import { tournamentSchema } from "../src/domain/schema";
import type { Tournament } from "../src/domain/types";
const digest = (data: string) =>
  createHash("sha256").update(data).digest("hex");
export const encode = (t: Tournament) =>
  JSON.stringify(
    { format: "open-volleyball", checksum: digest(JSON.stringify(t)), data: t },
    null,
    2,
  );
export function decode(raw: string): Tournament {
  let v;
  try {
    v = JSON.parse(raw);
  } catch {
    throw new Error(
      "Le fichier tournoi est illisible. Consultez le diagnostic ou restaurez la sauvegarde.",
    );
  }
  check(
    v && typeof v === "object" && v.format === "open-volleyball",
    "Ancien format ou package non reconnu. La source n’a pas été modifiée.",
  );
  check(
    v.checksum === digest(JSON.stringify(v.data)),
    "Le contrôle d’intégrité du package a échoué. Utilisez une sauvegarde.",
  );
  const result = tournamentSchema.safeParse(v.data);
  check(result.success, "Le contenu du package est incomplet ou incompatible.");
  const t = result.data as Tournament;
  assertInvariants(t);
  return t;
}
export async function atomicWrite(file: string, data: string | Buffer) {
  const tmp = `${file}.${randomUUID()}.tmp`;
  let h;
  try {
    h = await fs.open(tmp, "wx");
    await h.writeFile(data);
    await h.sync();
    await h.close();
    h = undefined;
    await fs.rename(tmp, file);
  } finally {
    await h?.close();
    await fs.rm(tmp, { force: true }).catch(() => {});
  }
}
export class PackageStore {
  constructor(
    public folder: string,
    public current: Tournament,
  ) {}
  static async create(parent: string, name: string) {
    const t = createTournament(name);
    const stat = await fs.stat(parent).catch(() => null);
    check(
      stat?.isDirectory(),
      "Le dossier de destination est inaccessible. Choisissez un dossier existant.",
    );
    const leaf =
      name
        .trim()
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
        .replace(/[. ]+$/, "") || "Tournoi";
    const folder = path.resolve(parent, `${leaf}.openvolley`);
    check(
      path.dirname(folder) === path.resolve(parent),
      "Destination hors du dossier choisi.",
    );
    await fs.mkdir(folder).catch((e: NodeJS.ErrnoException) => {
      throw new Error(
        e.code === "EEXIST"
          ? "Un package de ce nom existe déjà. Choisissez un autre nom ou ouvrez-le."
          : "Impossible de créer le package dans ce dossier.",
      );
    });
    try {
      await fs.mkdir(path.join(folder, "documents"));
      await fs.mkdir(path.join(folder, "history"));
      await atomicWrite(path.join(folder, "tournament.json"), encode(t));
      const store = new PackageStore(folder, t);
      await store.lock();
      return store;
    } catch (e) {
      await fs.rm(folder, { recursive: true, force: true });
      throw e;
    }
  }
  static async open(folder: string) {
    const stat = await fs.stat(folder).catch(() => null);
    check(
      stat?.isDirectory(),
      "Ce dossier est introuvable ou inaccessible. Vous pouvez retirer ce récent de la liste.",
    );
    let raw;
    try {
      raw = await fs.readFile(path.join(folder, "tournament.json"), "utf8");
    } catch {
      throw new Error(
        "Aucun tournament.json lisible. Sélectionnez le dossier .openvolley complet. Les anciens packages doivent être convertis séparément.",
      );
    }
    const store = new PackageStore(folder, decode(raw));
    await store.lock();
    return store;
  }
  async lock() {
    const lockFile = path.join(this.folder, ".openvolleyball.lock");
    try {
      const old = JSON.parse(await fs.readFile(lockFile, "utf8"));
      let alive = false;
      try {
        process.kill(old.pid, 0);
        alive = true;
      } catch {}
      check(
        !alive,
        "Ce package est déjà ouvert dans une autre session. Fermez-la avant de continuer.",
      );
      await fs.rm(lockFile, { force: true });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    await fs.writeFile(
      lockFile,
      JSON.stringify({ pid: process.pid, at: new Date().toISOString() }),
      { flag: "wx" },
    );
  }
  async close() {
    await fs.rm(path.join(this.folder, ".openvolleyball.lock"), {
      force: true,
    });
  }
  async save(t: Tournament) {
    if (t === this.current) return;
    assertInvariants(t);
    check(
      t.id === this.current.id && t.revision === this.current.revision + 1,
      "Conflit de version : rechargez le tournoi avant de réessayer.",
    );
    const previous = encode(this.current);
    await atomicWrite(
      path.join(
        this.folder,
        "history",
        `revision-${this.current.revision}.json`,
      ),
      previous,
    );
    await atomicWrite(
      path.join(this.folder, "tournament.backup.json"),
      previous,
    );
    await atomicWrite(path.join(this.folder, "tournament.json"), encode(t));
    this.current = t;
  }
  documentPath(file: string) {
    const dest = path.resolve(this.folder, file);
    check(
      dest.startsWith(path.resolve(this.folder, "documents") + path.sep) &&
        path.extname(dest) === ".pdf",
      "Lien document invalide.",
    );
    return dest;
  }
}
