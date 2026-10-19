import { it, expect, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  applyCommand,
  assertInvariants,
  getPhase,
  correctionImpact,
  laneCandidates,
} from "../src/domain/engine";
import { PackageStore, decode, encode } from "../electron/store";
import {
  registered,
  groupPhase,
  playPhase,
  splitTournament,
  finals,
} from "./helpers";

it("Existing registrations remain editable in preparation and snapshot correctly at confirmation", () => {
  let t = registered(4);
  t = applyCommand(t, {
    type: "draft",
    category: "Hommes",
    lane: "Commun",
    structure: [4],
    target: 21,
  });
  const team = structuredClone(t.teams[0]);
  team.name = "Étoiles révisées";
  team.players[0].level = 3;
  t = applyCommand(t, { type: "team", team });
  expect(t.phases[0].teamNames[team.id]).toBe(team.name);
  expect(t.phases[0].levels[team.id]).toBe(2);
  t = applyCommand(t, { type: "confirm", phaseId: t.phases[0].id });
  expect(() => applyCommand(t, { type: "team", team })).toThrow("verrouillées");
});

it("Failed current-state replacement leaves durable and in-memory old revision intact", async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "OV-atomic-"));
  const store = await PackageStore.create(parent, "Atomic");
  try {
    const old = structuredClone(store.current);
    const next = applyCommand(old, {
      type: "demo-teams",
      category: "Hommes",
      count: 5,
    });
    const rename = fs.rename.bind(fs);
    const mock = vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
      if (to === path.join(store.folder, "tournament.json"))
        throw new Error("Disque plein simulé");
      return rename(from, to);
    });
    await expect(store.save(next)).rejects.toThrow("Disque plein");
    mock.mockRestore();
    expect(store.current).toEqual(old);
    expect(
      decode(
        await fs.readFile(path.join(store.folder, "tournament.json"), "utf8"),
      ),
    ).toEqual(old);
    expect(
      (await fs.readdir(store.folder)).filter((x) => x.endsWith(".tmp")),
    ).toHaveLength(0);
  } finally {
    vi.restoreAllMocks();
    await store.close();
    expect(path.dirname(parent)).toBe(os.tmpdir());
    await fs.rm(parent, { recursive: true, force: true });
  }
});
it("Corrections invalidate sheets of unplayed downstream fixtures as well as played results", () => {
  let t = groupPhase(registered(8));
  t = playPhase(t, t.phases[0].id);
  t = splitTournament(t, 4);
  t = finals(t, "Principale", 4);
  const pid = t.phases.at(-1)!.id;
  const semis = getPhase(t, pid).matches.filter((m) => m.round === 0);
  for (const m of semis)
    t = applyCommand(t, {
      type: "score",
      phaseId: pid,
      matchId: m.id,
      score: [21, 0],
    });
  const final = getPhase(t, pid).matches.find(
    (m) => m.round === 1 && !m.bronze,
  )!;
  t.documents.push({
    id: "sheet",
    phaseId: pid,
    matchId: final.id,
    file: "documents/final-sheet.pdf",
    revision: t.revision,
    pages: 1,
  });
  expect(correctionImpact(t, pid, semis[0].id).matches).toHaveLength(0);
  t = applyCommand(t, {
    type: "score",
    phaseId: pid,
    matchId: semis[0].id,
    score: [0, 21],
    correction: true,
    acknowledge: true,
  });
  expect(t.documents.some((d) => d.matchId === final.id)).toBe(false);
  expect(getPhase(t, pid).matches.find((m) => m.id === final.id)?.a).toBe(
    semis[0].b,
  );
});
it("Changing group arbitration invalidates its PDF association and disallows court collisions", () => {
  let t = registered(5);
  t = applyCommand(t, {
    type: "draft",
    category: "Hommes",
    lane: "Commun",
    structure: [5],
    target: 21,
  });
  const p = t.phases[0],
    groups = structuredClone(p.groups);
  groups[0].courts = ["A", "B"];
  t = applyCommand(t, {
    type: "draft-update",
    phaseId: p.id,
    groups,
    target: 21,
  });
  t = applyCommand(t, { type: "confirm", phaseId: p.id });
  const m = t.phases[0].matches[0];
  t.documents.push({
    id: "sheet",
    phaseId: p.id,
    groupId: groups[0].id,
    file: "documents/group-sheet.pdf",
    revision: t.revision,
    pages: 2,
  });
  expect(() =>
    applyCommand(t, {
      type: "match-details",
      phaseId: p.id,
      matchId: m.id,
      court: "B",
      referee: "Patricia",
    }),
  ).toThrow("même terrain");
  t = applyCommand(t, {
    type: "match-details",
    phaseId: p.id,
    matchId: m.id,
    court: "A",
    referee: "Patricia",
  });
  expect(t.documents).toHaveLength(0);
});
it("Rules confirmed before a draft is confirmed become its actual scoring rules", () => {
  let t = registered(4);
  t = applyCommand(t, {
    type: "draft",
    category: "Hommes",
    lane: "Commun",
    structure: [4],
    target: 21,
  });
  t = applyCommand(t, {
    type: "rules",
    rules: { ...t.rules, margin: 1, confirmed: true },
  });
  t = applyCommand(t, { type: "confirm", phaseId: t.phases[0].id });
  expect(t.phases[0].rules.margin).toBe(1);
  t = applyCommand(t, {
    type: "score",
    phaseId: t.phases[0].id,
    matchId: t.phases[0].matches[0].id,
    score: [21, 20],
  });
  assertInvariants(t);
});
it("Withdrawn teams stay in history but are excluded even from a new branch root", () => {
  let t = groupPhase(registered(8));
  t = playPhase(t, t.phases[0].id);
  t = splitTournament(t, 4);
  const teamId = t.splits[0].principale[0];
  t = applyCommand(t, { type: "withdraw", teamId, withdrawn: true });
  expect(laneCandidates(t, "Hommes", "Principale").ids).not.toContain(teamId);
  expect(t.phases[0].teamIds).toContain(teamId);
});
it("Malformed and structurally forged packages fail without affecting a valid aggregate", () => {
  const t = groupPhase(registered(4));
  expect(() => decode("null")).toThrow("non reconnu");
  expect(() => decode("{")).toThrow("illisible");
  const forged = structuredClone(t);
  forged.phases[0].sourceId = forged.phases[0].id;
  expect(() => decode(encode(forged))).toThrow("Cycle");
  expect(t.phases[0].sourceId).toBe(null);
});
