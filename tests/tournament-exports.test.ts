import { it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { PackageStore, encode } from "../electron/store";
import { snapshotTournament, playersCsv } from "../electron/tournament-exports";
import { makeSheet } from "../electron/pdf";
import { groupPhase, registered, playPhase } from "./helpers";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "OV-exports-épreuve-"));
  const source = path.join(root, "Original.openvolley"),
    destination = path.join(root, "Instantanés");
  for (const folder of [
    source,
    destination,
    path.join(source, "history"),
    path.join(source, "documents"),
    path.join(source, "scans"),
  ])
    await fs.mkdir(folder);
  const draft = groupPhase(registered(3));
  const t = playPhase(draft, draft.phases[0].id);
  const sheet = await makeSheet(
    t,
    t.phases[0],
    source,
    path.resolve("assets/fonts"),
    t.phases[0].groups[0],
  );
  t.documents = [sheet];
  t.paperForms = sheet.forms;
  t.schema = 2;
  const scan = Buffer.from("independent disposable scanned image");
  t.scanSources = [
    {
      id: "source",
      name: "Original.png",
      file: "scans/original.png",
      hash: createHash("sha256").update(scan).digest("hex"),
      importedAt: new Date().toISOString(),
      processed: true,
    },
  ];
  t.scanPages = [
    {
      id: "page",
      sourceId: "source",
      page: 1,
      image: "scans/aligned.png",
      status: "ignored",
      values: {},
    },
  ];
  await fs.writeFile(path.join(source, "scans/original.png"), scan);
  await fs.writeFile(path.join(source, "scans/aligned.png"), "aligned crop");
  await fs.writeFile(path.join(source, "history/revision-0.json"), encode(t));
  await fs.writeFile(path.join(source, "tournament.backup.json"), encode(t));
  await fs.writeFile(path.join(source, "tournament.json"), encode(t));
  await fs.writeFile(path.join(source, "notes.txt"), "Notes conservées");
  const store = new PackageStore(source, t);
  await store.lock();
  return {
    root,
    source,
    destination,
    store,
    cleanup: async () => {
      await store.close();
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}
async function inventory(
  folder: string,
  prefix = "",
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
    if (entry.name === ".openvolleyball.lock") continue;
    const name = prefix + entry.name,
      file = path.join(folder, entry.name);
    if (entry.isDirectory())
      Object.assign(result, await inventory(file, name + "/"));
    else
      result[name] = createHash("sha256")
        .update(await fs.readFile(file))
        .digest("hex");
  }
  return result;
}

it("creates an independently restorable full snapshot, with unchanged IDs, results, PDFs, scans and history, without a copied lock", async () => {
  const f = await fixture();
  let restored: PackageStore | undefined;
  try {
    const original = await inventory(f.source),
      state = structuredClone(f.store.current);
    const copy = await snapshotTournament(
      f.store,
      f.destination,
      "Avant les finales – été",
    );
    expect(path.basename(copy)).toBe("Avant les finales – été.openvolley");
    expect(path.extname(copy)).toBe(".openvolley");
    expect(await inventory(copy)).toEqual(original);
    expect(
      await fs.access(path.join(copy, ".openvolleyball.lock")).then(
        () => true,
        () => false,
      ),
    ).toBe(false);
    restored = await PackageStore.open(copy);
    expect(restored.current).toEqual(state);
    await restored.save({
      ...restored.current,
      name: "Copie indépendante",
      revision: restored.current.revision + 1,
    });
    expect(f.store.current).toEqual(state);
    expect(await inventory(f.source)).toEqual(original);
    const savedCopy = await fs.readFile(path.join(copy, "tournament.json"));
    await expect(
      snapshotTournament(
        f.store,
        f.destination,
        "Avant les finales – été.openvolley",
      ),
    ).rejects.toThrow(/existe déjà/);
    expect(await fs.readFile(path.join(copy, "tournament.json"))).toEqual(
      savedCopy,
    );
    await expect(
      snapshotTournament(f.store, f.destination, "../escape"),
    ).rejects.toThrow(/nom de backup/);
    expect(await fs.readdir(f.destination)).toEqual([path.basename(copy)]);
    const second = await snapshotTournament(f.store, f.destination);
    expect(second).not.toBe(copy);
    expect(await inventory(second)).toEqual(original);
  } finally {
    await restored?.close();
    await f.cleanup();
  }
});

it("refuses snapshots inside the original, including a directory alias, without creating a partial copy", async () => {
  const f = await fixture();
  try {
    await expect(snapshotTournament(f.store, f.source)).rejects.toThrow(
      /en dehors/,
    );
    await expect(
      snapshotTournament(f.store, path.join(f.source, "history")),
    ).rejects.toThrow(/en dehors/);
    const alias = path.join(f.root, "alias");
    await fs.symlink(
      f.source,
      alias,
      process.platform === "win32" ? "junction" : "dir",
    );
    await expect(snapshotTournament(f.store, alias)).rejects.toThrow(
      /en dehors/,
    );
    expect(await fs.readdir(f.destination)).toEqual([]);
  } finally {
    await f.cleanup();
  }
});

it("removes only its own staging folder if a linked tournament file is missing", async () => {
  const f = await fixture();
  try {
    await fs.unlink(path.join(f.source, f.store.current.documents[0].file));
    const before = await inventory(f.source);
    await expect(snapshotTournament(f.store, f.destination)).rejects.toThrow(
      /fichier manquant/,
    );
    expect(await fs.readdir(f.destination)).toEqual([]);
    expect(await inventory(f.source)).toEqual(before);
  } finally {
    await f.cleanup();
  }
});

it("exports exactly five UTF-8 CSV columns, all categories and letter levels, preserving accents, delimiters, quotes, line breaks and empty optional fields", () => {
  const t = registered(3);
  t.teams = t.teams.slice(0, 2);
  t.teams[0].name = 'Équipe; "Bleue"';
  t.teams[1].category = "Femmes";
  t.teams[1].withdrawn = true;
  t.teams[0].players = t.teams[0].players.slice(0, 2);
  t.teams[1].players = t.teams[1].players.slice(0, 2);
  t.teams
    .flatMap((team) => team.players)
    .forEach((player, i) => {
      player.level = 3 - i;
      player.email = "";
      player.club = "";
    });
  t.teams[0].players[0].name = 'Zoé "Été"\nDupré';
  t.teams[0].players[0].email = "zoe@example.com";
  t.teams[0].players[0].club = "Club; Léman";
  const bytes = playersCsv(t),
    csv = bytes.toString("utf8");
  expect(Array.from(bytes.subarray(0, 3))).toEqual([239, 187, 191]);
  expect(csv).toContain(
    '"Nom du joueur";"Nom de l’équipe";"Niveau";"E-mail";"Club"\r\n',
  );
  expect(csv).toContain(
    '"Zoé ""Été""\nDupré";"Équipe; ""Bleue""";"N";"zoe@example.com";"Club; Léman"\r\n',
  );
  for (const level of ["N", "R", "D", "U"])
    expect(csv).toContain(`;"${level}";`);
  expect(csv).toContain(';"";""\r\n');
  t.teams = [];
  expect(playersCsv(t).toString("utf8").split("\r\n")).toHaveLength(2);
});
