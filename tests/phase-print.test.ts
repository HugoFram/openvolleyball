import { it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { phaseDocuments, mergePhaseSheets } from "../electron/phase-print";
import {
  groupPhase,
  registered,
  playPhase,
  splitTournament,
  finals,
} from "./helpers";
import type { Document } from "../src/domain/types";

it("phase-wide printing uses group order, includes every court page, and leaves source documents untouched", async () => {
  const t = groupPhase(registered(8), "Commun", [5, 3]),
    p = t.phases[0];
  t.documents = p.groups
    .map((g, i) => ({
      id: g.id,
      phaseId: p.id,
      groupId: g.id,
      file: `${i}.pdf`,
      sourceHash: "test",
      revision: 1,
      pages: i ? 1 : 2,
    }))
    .reverse();
  const before = structuredClone(t),
    sources = new Map<string, Uint8Array>();
  for (const d of t.documents) {
    const pdf = await PDFDocument.create();
    for (let i = 0; i < d.pages; i++)
      pdf.addPage([100 + Number(d.file[0]) * 10 + i, 200]);
    sources.set(d.id, await pdf.save());
  }
  const bytes = await mergePhaseSheets(phaseDocuments(t, p.id), async (d) =>
    sources.get(d.id)!,
  );
  const merged = await PDFDocument.load(bytes);
  expect(merged.getPages().map((p) => p.getWidth())).toEqual([100, 101, 110]);
  expect(t).toEqual(before);
  t.documents.pop();
  expect(() => phaseDocuments(t, p.id)).toThrow("absente");
  expect(() => phaseDocuments(t, "unknown")).toThrow();
});

it("final-phase printing follows rounds then match order, includes final and bronze", () => {
  let t = groupPhase(registered(16));
  t = playPhase(t, t.phases[0].id);
  t = splitTournament(t, 8);
  t = finals(t, "Principale", 8);
  const p = t.phases.at(-1)!;
  t.documents = p.matches
    .map((m) => ({
      id: m.id,
      phaseId: p.id,
      matchId: m.id,
      file: `${m.id}.pdf`,
      sourceHash: "test",
      revision: 1,
      pages: 1,
    }))
    .reverse();
  const docs = phaseDocuments(t, p.id);
  expect(docs).toHaveLength(p.matches.length);
  expect(docs.map((d) => d.matchId)).toEqual(
    [...p.matches]
      .sort(
        (a, b) =>
          a.round - b.round ||
          Number(!!a.bronze) - Number(!!b.bronze) ||
          a.order - b.order,
      )
      .map((m) => m.id),
  );
});

it("a bad or excessive sheet fails before any partial print job can be submitted", async () => {
  const d = { id: "a" } as Document;
  await expect(
    mergePhaseSheets([d], async () => new Uint8Array([1, 2, 3])),
  ).rejects.toThrow();
  const pdf = await PDFDocument.create();
  for (let i = 0; i < 201; i++) pdf.addPage();
  const bytes = await pdf.save();
  await expect(mergePhaseSheets([d], async () => bytes)).rejects.toThrow("200");
  await expect(mergePhaseSheets([], async () => bytes)).rejects.toThrow(
    "aucune",
  );
});
