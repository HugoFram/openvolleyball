import { expect, it, vi } from "vitest";
vi.mock("electron", () => ({ nativeImage: {} }));
import { reviewedRegistrations } from "../electron/registration-export";
import { createTournament } from "../src/domain/engine";
import type { ScanPage, PaperForm } from "../src/domain/scans";
import { tournamentSchema } from "../src/domain/schema";

it("exports only approved, identified and aligned registration scans", () => {
  const t = createTournament("Export"),
    base: ScanPage = {
      id: "reviewed",
      sourceId: "source",
      page: 1,
      formId: "registration",
      image: "scans/one.png",
      aligned: true,
      status: "approved",
      values: {},
      accepted: { teamName: "Texte relu" },
    };
  t.paperForms = [
    { id: "registration", kind: "registration", tournamentId: t.id },
    { id: "scores", kind: "scores" },
    { id: "foreign", kind: "registration", tournamentId: "other-tournament" },
  ] as PaperForm[];
  t.scanPages = [
    base,
    { ...base, id: "pending", status: "pending" },
    { ...base, id: "ignored", status: "ignored" },
    { ...base, id: "unaligned", aligned: false },
    { ...base, id: "legacy", aligned: undefined },
    { ...base, id: "unknown", formId: "unknown" },
    { ...base, id: "scores", formId: "scores" },
    { ...base, id: "foreign", formId: "foreign" },
  ];
  expect(reviewedRegistrations(t).map((s) => s.id)).toEqual(["reviewed"]);
});

it("upgrading preserves alpha.4 suggestions alongside new-reader corrections", () => {
  const t = createTournament("Anciennes inscriptions");
  t.schema = 2;
  t.scanPages = [
    {
      id: "scan",
      sourceId: "source",
      page: 1,
      image: "scans/one.png",
      status: "approved",
      aligned: true,
      values: { teamName: { value: "Les Étoiles" } },
      originalValues: {
        teamName: { value: "Les Etoiles", reader: "trocr-v1" },
      },
      accepted: { teamName: "Les Étoiles" },
    },
    {
      id: "new-scan",
      sourceId: "new-source",
      page: 1,
      image: "scans/two.png",
      status: "pending",
      aligned: true,
      values: { teamName: { value: "Chêne", reader: "trocr-fr-v2" } },
    },
  ];
  const saved = tournamentSchema.parse(JSON.parse(JSON.stringify(t)));
  expect(saved.scanPages![0].originalValues!.teamName).toEqual({
    value: "Les Etoiles",
    reader: "trocr-v1",
  });
  expect(saved.scanPages![0].accepted!.teamName).toBe("Les Étoiles");
  expect(saved.scanPages![1].values.teamName.reader).toBe("trocr-fr-v2");
});
