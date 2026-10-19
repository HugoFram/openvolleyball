import { it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PDFDocument, PDFName, PDFArray, PDFDict } from "pdf-lib";
import sharp from "sharp";
import {
  applyCommand,
  compareCross,
  createTournament,
  groupSlots,
  laneCandidates,
  overallStandings,
  rankingPlan,
  resolvePlan,
  normalizeWebsite,
  assertInvariants,
} from "../src/domain/engine";
import type { Standing } from "../src/domain/types";
import { levelLetter, playerLevels } from "../src/domain/levels";
import { decode, encode } from "../electron/store";
import { makeSheet, sheetFingerprint } from "../electron/pdf";
import { makeRegistrationSheet } from "../electron/registration-pdf";
import {
  registered,
  groupPhase,
  playPhase,
  splitTournament,
  finals,
  decisionsFor,
} from "./helpers";

it("Letters map to stored values and both new and edited teams require 3–4 players", () => {
  expect(playerLevels.map((x) => [x.letter, x.value])).toEqual([
    ["N", 3],
    ["R", 2],
    ["D", 1],
    ["U", 0],
  ]);
  expect([0, 1, 2, 3].map(levelLetter)).toEqual(["U", "D", "R", "N"]);
  const t = registered(3);
  for (const size of [0, 1, 2, 5])
    for (const existing of [true, false]) {
      const team = structuredClone(t.teams[0]);
      if (!existing) {
        team.id = crypto.randomUUID();
        team.name = "Nouvelle";
      }
      team.players = Array.from({ length: size }, (_, i) => ({
        ...t.teams[0].players[0],
        id: crypto.randomUUID(),
        name: `Joueur ${i}`,
      }));
      expect(() => applyCommand(t, { type: "team", team })).toThrow("3 ou 4");
    }
  for (const size of [3, 4]) {
    const team = structuredClone(t.teams[0]);
    team.players = Array.from({ length: size }, (_, i) => ({
      ...team.players[0],
      id: crypto.randomUUID(),
      name: `Joueur ${i}`,
    }));
    expect(
      applyCommand(t, { type: "team", team }).teams[0].players,
    ).toHaveLength(size);
  }
});
it("Ranking uses exact win/played then difference/played ratios, never raw totals or group place", () => {
  const row = (wins: number, played: number, diff: number, place = 1) =>
    ({ wins, played, diff, place }) as Standing;
  expect(compareCross(row(3, 4, 40), row(2, 2, 1))).toBeGreaterThan(0);
  expect(compareCross(row(2, 2, 4, 2), row(3, 3, 5, 1))).toBeLessThan(0);
  expect(compareCross(row(1, 2, 4), row(2, 4, 8))).toBe(0);
  let t = groupPhase(registered(17), "Commun", [5, 4, 4, 4]);
  t = playPhase(t, t.phases[0].id);
  const rows = overallStandings(t.phases[0]);
  expect(rows).toHaveLength(17);
  rows
    .slice(1)
    .forEach((r, i) => expect(compareCross(rows[i], r)).toBeLessThanOrEqual(0));
});
it("Subsequent groups snake previous results, retain ranks and ignore changes in player strength", () => {
  let t = groupPhase(registered(17), "Commun", [5, 4, 4, 4]);
  t = playPhase(t, t.phases[0].id);
  t = splitTournament(t, 8);
  for (let iteration = 0; iteration < 2; iteration++) {
    const { source, ids } = laneCandidates(t, "Hommes", "Principale");
    const plan = rankingPlan(t, source!, ids.length, "groups", ids, [4, 4]);
    const decisions = decisionsFor(
      t,
      source!,
      ids.length,
      "groups",
      ids,
      [4, 4],
    );
    const order = resolvePlan(plan, decisions);
    const draft = (original: typeof t) =>
      applyCommand(original, {
        type: "draft",
        category: "Hommes",
        lane: "Principale",
        structure: [4, 4],
        target: 21,
        decisions,
      });
    const next = draft(t);
    const changed = structuredClone(t);
    changed.teams.forEach((team, i) =>
      team.players.forEach((p) => (p.level = i % 4)),
    );
    const nextChanged = draft(changed);
    expect(next.phases.at(-1)!.groups.map((g) => g.teamIds)).toEqual(
      nextChanged.phases.at(-1)!.groups.map((g) => g.teamIds),
    );
    const p = next.phases.at(-1)!;
    groupSlots([4, 4]).forEach((g, i) =>
      expect(p.groups[g].teamIds).toContain(order[i]),
    );
    expect(Object.keys(p.previousRanks!)).toHaveLength(8);
    expect(decode(encode(next))).toEqual(next);
    t = applyCommand(next, { type: "confirm", phaseId: p.id });
    t = playPhase(t, p.id);
  }
});
it("Decisive ties require named choices for new group destinations, with no tie selection for one group", () => {
  let t = groupPhase(registered(8), "Commun", [4, 4]);
  const pid = t.phases[0].id;
  // Repeating identical perfect-winner results creates cross-group ties.
  for (const g of t.phases[0].groups)
    for (const m of t.phases[0].matches.filter((m) => m.groupId === g.id)) {
      const winner =
        g.teamIds.indexOf(m.a!) < g.teamIds.indexOf(m.b!) ? m.a : m.b;
      t = applyCommand(t, {
        type: "score",
        phaseId: pid,
        matchId: m.id,
        score: m.a === winner ? [21, 0] : [0, 21],
      });
    }
  t = splitTournament(t, 4);
  const { source, ids } = laneCandidates(t, "Hommes", "Principale");
  expect(rankingPlan(t, source!, 4, "groups", ids, [4]).ties).toHaveLength(0);
  const all = t.phases[0].teamIds,
    plan = rankingPlan(t, t.phases[0], 8, "groups", all, [4, 4]);
  expect(plan.ties.length).toBeGreaterThan(0);
  expect(() => resolvePlan(plan, {})).toThrow("ordre complet");
  const decisions = Object.fromEntries(
    plan.ties.map((tie) => [tie.key, tie.rows.map((r) => r.teamId).reverse()]),
  );
  const resolved = resolvePlan(plan, decisions);
  for (const tie of plan.ties)
    expect(resolved.filter((id) => decisions[tie.key].includes(id))).toEqual(
      decisions[tie.key],
    );
});
it("Two courts are accepted only for five-team drafts", () => {
  for (const n of [3, 4, 5]) {
    let t = registered(n);
    t = applyCommand(t, {
      type: "draft",
      category: "Hommes",
      lane: "Commun",
      structure: [n],
      target: 21,
    });
    const p = t.phases[0],
      groups = structuredClone(p.groups);
    groups[0].courts.push("B");
    const command = {
      type: "draft-update" as const,
      phaseId: p.id,
      groups,
      target: 21 as const,
    };
    if (n === 5)
      expect(applyCommand(t, command).phases[0].groups[0].courts).toHaveLength(
        2,
      );
    else
      expect(() => applyCommand(t, command)).toThrow("seuls les groupes de 5");
  }
});
it("Knockout matches accept an empty referee and participant changes invalidate the sheet fingerprint", () => {
  let t = groupPhase(registered(8));
  t = playPhase(t, t.phases[0].id);
  t = splitTournament(t, 4);
  t = finals(t, "Principale", 4);
  const pid = t.phases.at(-1)!.id,
    p = t.phases.at(-1)!,
    m = p.matches[0],
    final = p.matches.find((m) => m.round === 1 && !m.bronze)!;
  expect(m.referee).toBe("");
  const before = sheetFingerprint(t, p, undefined, final);
  t = applyCommand(t, {
    type: "match-details",
    phaseId: pid,
    matchId: m.id,
    court: "Court A",
    referee: "",
  });
  for (const semi of t.phases.at(-1)!.matches.filter((m) => m.round === 0))
    t = applyCommand(t, {
      type: "score",
      phaseId: pid,
      matchId: semi.id,
      score: [21, 0],
    });
  const next = t.phases.at(-1)!;
  expect(
    sheetFingerprint(
      t,
      next,
      undefined,
      next.matches.find((m) => m.id === final.id)!,
    ),
  ).not.toBe(before);
});
it("Historical one-point results survive; subsequent scores and corrections require two points", () => {
  let t = groupPhase(registered(4));
  const p = t.phases[0];
  p.rules.margin = 1;
  p.rules.crossGroup = "place-first";
  p.matches[0].score = [21, 20];
  t = decode(encode(t));
  const m = t.phases[0].matches[1];
  t = applyCommand(t, {
    type: "score",
    phaseId: p.id,
    matchId: m.id,
    score: [22, 20],
  });
  expect(t.phases[0].matches[0].score).toEqual([21, 20]);
  expect(t.phases[0].matches[1].scoredMargin).toBe(2);
  expect(() =>
    applyCommand(t, {
      type: "score",
      phaseId: p.id,
      matchId: t.phases[0].matches[2].id,
      score: [21, 20],
    }),
  ).toThrow("écart");
  expect(decode(encode(t))).toEqual(t);
});
it("Website validation normalizes a domain and rejects unsupported or credential-bearing URLs", () => {
  expect(normalizeWebsite(" volley.example/test ")).toBe(
    "https://volley.example/test",
  );
  expect(normalizeWebsite("")).toBeUndefined();
  for (const url of [
    "javascript:alert(1)",
    "file:///c:/x",
    "https://name:secret@example.org",
    "https://",
  ])
    expect(() => createTournament("Test", { website: url })).toThrow();
});
it("Branding is portable and included on every group/match and registration PDF page", async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "OV-branding-"));
  try {
    const logo = await sharp({
      create: { width: 32, height: 32, channels: 4, background: "#145b4b" },
    })
      .png()
      .toBuffer();
    let t = groupPhase(registered(5));
    t.branding = {
      website: "https://volley.example",
      logo: `data:image/png;base64,${logo.toString("base64")}`,
    };
    t.teams[0].players[0].email = "eloise@example.org";
    t.teams[0].players[0].club = "Étoiles";
    expect(decode(encode(t))).toEqual(t);
    const p = t.phases[0],
      fonts = path.resolve("assets/fonts");
    const docs = [
      await makeSheet(t, p, folder, fonts, p.groups[0]),
      await makeSheet(t, p, folder, fonts, undefined, p.matches[0]),
      await makeRegistrationSheet(t, folder, fonts, "Hommes", 1, 2),
      await makeRegistrationSheet(t, folder, fonts, "Femmes", 2, 3),
      await makeRegistrationSheet(t, folder, fonts, "Hommes", 1, 1, t.teams[0]),
    ];
    for (const d of docs) {
      const pdf = await PDFDocument.load(
        await fs.readFile(path.join(folder, d.file)),
      );
      expect(pdf.getPageCount()).toBe(d.pages);
      for (const page of pdf.getPages()) {
        const resources = page.node.Resources()!,
          images = resources.lookup(PDFName.of("XObject"), PDFDict);
        expect(images.keys().length).toBeGreaterThan(0);
        const annots = page.node.Annots() as PDFArray;
        expect(annots?.size()).toBeGreaterThan(0);
        expect(
          annots
            .asArray()
            .some(
              (ref) =>
                pdf.context
                  .lookup(ref, PDFDict)
                  .get(PDFName.of("Subtype"))
                  ?.toString() === "/Link",
            ),
        ).toBe(true);
      }
      t.documents.push(d);
    }
    assertInvariants(t);
    expect(decode(encode(t))).toEqual(t);
    await expect(
      makeRegistrationSheet(t, folder, fonts, "Hommes", 2, 0),
    ).rejects.toThrow("1 à 50");
  } finally {
    await fs.rm(folder, { recursive: true, force: true });
  }
});
