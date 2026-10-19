import { it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PackageStore, decode, encode } from "../electron/store";
import { groupPages, makeSheet } from "../electron/pdf";
import { PDFDocument as PDFReader } from "pdf-lib";
import { applyCommand } from "../src/domain/engine";
import { registered, groupPhase, playPhase, splitTournament } from "./helpers";

it("A01/A19: Unicode paths, conflicts, locking, atomic reopen and A→B→A without crossed identities", async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "OV-épreuve "));
  let a: PackageStore | undefined, b: PackageStore | undefined;
  try {
    a = await PackageStore.create(parent, "Été en forêt");
    expect(a.current.name).toBe("Été en forêt");
    await expect(PackageStore.create(parent, "Été en forêt")).rejects.toThrow(
      "existe déjà",
    );
    await expect(PackageStore.open(a.folder)).rejects.toThrow("autre session");
    let t = applyCommand(a.current, {
      type: "rules",
      rules: { ...a.current.rules, confirmed: true },
    });
    await a.save(t);
    await a.save(
      applyCommand(a.current, {
        type: "demo-teams",
        category: "Hommes",
        count: 17,
      }),
    );
    const aid = a.current.id,
      folder = a.folder,
      snapshot = encode(a.current);
    await a.close();
    b = await PackageStore.create(parent, "Autre tournoi");
    expect(b.current.teams).toHaveLength(0);
    await b.close();
    b = undefined;
    a = await PackageStore.open(folder);
    expect(a.current.id).toBe(aid);
    expect(a.current).toEqual(decode(snapshot));
    await expect(
      a.save({ ...a.current, id: "wrong", revision: a.current.revision + 1 }),
    ).rejects.toThrow("Conflit");
    const raw = await fs.readFile(path.join(folder, "tournament.json"), "utf8");
    expect(() => decode(raw.replace("Été en forêt", "Corrupted"))).toThrow(
      "intégrité",
    );
    expect(
      decode(
        await fs.readFile(path.join(folder, "tournament.backup.json"), "utf8"),
      ).revision,
    ).toBe(1);
  } finally {
    await a?.close();
    await b?.close();
    await fs.rm(parent, { recursive: true, force: true });
  }
});
it("A06/A08: actual A4 PDFs, five-team/two-court 2×5 pages, all other schedules retained", async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "OV-PDF-"));
  try {
    for (const n of [3, 4, 5])
      for (const courts of n === 5 ? [1, 2] : [1]) {
        let t = registered(n);
        t = applyCommand(t, {
          type: "draft",
          category: "Hommes",
          lane: "Commun",
          structure: [n],
          target: 25,
        });
        const p = t.phases[0];
        if (courts === 2) {
          const groups = structuredClone(p.groups);
          groups[0].courts.push("Terrain Érable B");
          t = applyCommand(t, {
            type: "draft-update",
            phaseId: p.id,
            groups,
            target: 25,
          });
        }
        t = applyCommand(t, { type: "confirm", phaseId: p.id });
        const phase = t.phases[0],
          g = phase.groups[0];
        const pages = groupPages(phase, g);
        expect(pages.flatMap((p) => p.matches)).toHaveLength((n * (n - 1)) / 2);
        if (n === 5 && courts === 2)
          expect(pages.map((p) => p.matches.length)).toEqual([5, 5]);
        const d = await makeSheet(
          t,
          phase,
          folder,
          path.resolve("assets/fonts"),
          g,
        );
        const bytes = await fs.readFile(path.join(folder, d.file));
        expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
        expect(d.pages).toBe(pages.length);
        const actual = await PDFReader.load(bytes);
        expect(actual.getPageCount()).toBe(pages.length);
        expect(actual.getPage(0).getWidth()).toBeCloseTo(595.28, 1);
        expect(actual.getPage(0).getHeight()).toBeCloseTo(841.89, 1);
      }
  } finally {
    await fs.rm(folder, { recursive: true, force: true });
  }
});
it("A19: serialize/reopen complete hierarchy and all results without a transient UI state", () => {
  let t = groupPhase(registered(17), "Commun", [5, 4, 4, 4]);
  t = playPhase(t, t.phases[0].id);
  t = splitTournament(t, 8);
  t = groupPhase(t, "Principale", [4, 4]);
  t = playPhase(t, t.phases.at(-1)!.id);
  t = groupPhase(t, "Principale", [4, 4]);
  t = playPhase(t, t.phases.at(-1)!.id);
  expect(decode(encode(t))).toEqual(t);
});
