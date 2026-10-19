import { it, expect } from "vitest";
import { groupPhase, registered } from "./helpers";
import {
  approveScan,
  currentForm,
  type PaperForm,
  type ScanPage,
} from "../src/domain/scans";
import { applyCommand, id } from "../src/domain/engine";
import { decode, encode } from "../electron/store";
import {
  homography,
  project,
  digitTensor,
  findMarker,
} from "../src/scan/geometry";

function fixture() {
  const t = groupPhase(registered(3)),
    p = t.phases[0],
    documentId = id();
  const form: PaperForm = {
    id: id(),
    documentId,
    tournamentId: t.id,
    version: 1,
    page: 1,
    kind: "scores",
    label: "Groupe",
    category: "Hommes",
    phaseId: p.id,
    groupId: p.groups[0].id,
    sourceHash: "current",
    qr: [485, 161, 64, 64],
    fields: p.matches.flatMap((m) =>
      [0, 1].map((side) => ({
        key: `${m.id}:${side}`,
        label: "Score",
        rect: [0, 0, 50, 50] as [number, number, number, number],
        matchId: m.id,
        side: side as 0 | 1,
      })),
    ),
    participants: Object.fromEntries(p.matches.map((m) => [m.id, [m.a, m.b]])),
  };
  t.documents = [
    {
      id: documentId,
      file: "documents/test.pdf",
      phaseId: p.id,
      groupId: p.groups[0].id,
      revision: t.revision,
      pages: 1,
      sourceHash: "current",
      forms: [form],
    },
  ];
  const scan: ScanPage = {
    id: id(),
    sourceId: id(),
    page: 1,
    formId: form.id,
    image: "scans/test.png",
    status: "pending",
    values: {},
  };
  t.paperForms = [form];
  t.scanPages = [scan];
  t.scanSources = [
    {
      id: scan.sourceId,
      file: "scans/test.pdf",
      name: "Test",
      hash: "hash",
      importedAt: "now",
    },
  ];
  return { t, p, form, scan };
}
it("Scanned score approval is one atomic revision, auditable, durable and never mutates its input", () => {
  const { t, p, scan } = fixture(),
    before = encode(t);
  const accepted = Object.fromEntries(
    p.matches.flatMap((m) => [
      [`${m.id}:0`, "21"],
      [`${m.id}:1`, "17"],
    ]),
  );
  const next = approveScan(t, scan.id, accepted);
  expect(encode(t)).toBe(before);
  expect(next.revision).toBe(t.revision + 1);
  expect(next.phases[0].status).toBe("Terminée");
  expect(next.scanPages![0].status).toBe("approved");
  expect(next.scanPages![0].accepted).toEqual(accepted);
  expect(next.audit.at(-1)!.action).toBe("scan-approved");
  expect(decode(encode(next))).toEqual(next);
  expect(() => approveScan(next, scan.id, accepted)).toThrow("ne peut plus");
});
it("Incomplete, impossible, conflicting and stale scan approvals leave all results untouched", () => {
  const { t, p, scan, form } = fixture(),
    first = p.matches[0],
    second = p.matches[1];
  expect(() => approveScan(t, scan.id, { [`${first.id}:0`]: "21" })).toThrow(
    "deux scores",
  );
  expect(() =>
    approveScan(t, scan.id, {
      [`${first.id}:0`]: "21",
      [`${first.id}:1`]: "17",
      [`${second.id}:0`]: "21",
      [`${second.id}:1`]: "20",
    }),
  ).toThrow();
  expect(t.phases[0].matches.every((m) => !m.score)).toBe(true);
  const scored = applyCommand(t, {
    type: "score",
    phaseId: p.id,
    matchId: first.id,
    score: [21, 18],
  });
  expect(() =>
    approveScan(scored, scan.id, {
      [`${first.id}:0`]: "21",
      [`${first.id}:1`]: "17",
    }),
  ).toThrow("différent");
  const stale = structuredClone(t);
  stale.documents = [];
  expect(() => currentForm(stale, form.id)).toThrow("remplacée");
  const swapped = structuredClone(t);
  [swapped.phases[0].matches[0].a, swapped.phases[0].matches[0].b] = [
    first.b,
    first.a,
  ];
  expect(() => currentForm(swapped, form.id)).toThrow("participants");
  expect(() => approveScan(t, scan.id, { unknown: "21" })).toThrow("inconnu");
});
it("Reviewed blank registration sheets use the existing roster and player-count validation", () => {
  const { t, form, scan } = fixture();
  t.phases = [];
  t.documents = [];
  t.teams = [];
  form.kind = "registration";
  form.phaseId = undefined;
  form.participants = {};
  form.fields = [
    { key: "teamName", label: "Team", rect: [0, 0, 10, 10] },
    ...[0, 1, 2, 3].flatMap((i) =>
      ["name", "level", "email", "club"].map((f) => ({
        key: `player${i}:${f}`,
        label: f,
        rect: [0, 0, 10, 10] as [number, number, number, number],
      })),
    ),
  ];
  const accepted: Record<string, string> = { teamName: "Les Nuages" };
  for (let i = 0; i < 2; i++) {
    accepted[`player${i}:name`] = `Player ${i}`;
    accepted[`player${i}:level`] = "R";
  }
  expect(() => approveScan(t, scan.id, accepted)).toThrow();
  accepted["player2:name"] = "Anaïs";
  accepted["player2:level"] = "N";
  const next = approveScan(t, scan.id, accepted);
  expect(next.teams[0].players.map((p) => p.level)).toEqual([2, 2, 3]);
  expect(next.teams[0].players[2].name).toBe("Anaïs");
});
it("Perspective mapping recovers known coordinates, blank boxes remain blank and corner squares are isolated", () => {
  const from = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];
  const to = [
    { x: 5, y: 8 },
    { x: 28, y: 7 },
    { x: 26, y: 33 },
    { x: 8, y: 29 },
  ];
  const h = homography(from, to);
  from.forEach((p, i) => {
    const q = project(h, p.x, p.y);
    expect(q.x).toBeCloseTo(to[i].x);
    expect(q.y).toBeCloseTo(to[i].y);
  });
  const data = new Uint8ClampedArray(100 * 100 * 4);
  data.fill(255);
  const im = { width: 100, height: 100, data };
  expect(digitTensor(im, [0, 0, 30, 30], 1)).toBeNull();
  for (let y = 20; y < 32; y++)
    for (let x = 20; x < 32; x++) {
      const i = (y * 100 + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 0;
    }
  expect(findMarker(im, { x: 28, y: 27 }, 12)).toEqual({ x: 25.5, y: 25.5 });
});
