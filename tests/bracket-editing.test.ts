import { it, expect } from "vitest";
import {
  applyCommand,
  assertInvariants,
  canSwapBracketTeams,
  overallStandings,
  previousPhaseRanks,
  outcome,
  getPhase,
} from "../src/domain/engine";
import { decode, encode } from "../electron/store";
import {
  registered,
  groupPhase,
  playPhase,
  splitTournament,
  finals,
} from "./helpers";
function tournament(n: number) {
  let t = groupPhase(registered(n + 4));
  t = playPhase(t, t.phases[0].id);
  t = splitTournament(t, n);
  return finals(t, "Principale", n);
}
for (const n of [4, 8, 16])
  it(`Swapping a ${n}-team draw preserves ranks, qualification and graph identities; new participants advance`, () => {
    let t = tournament(n);
    t = finals(t, "Consolante", 4);
    t = applyCommand(t, { type: "random", phaseId: t.phases.at(-1)!.id });
    const p = t.phases.find(
        (p) => p.kind === "knockout" && p.lane === "Principale",
      )!,
      before = structuredClone(p),
      other = structuredClone(t.phases.filter((q) => q.id !== p.id));
    const first = p.matches.filter((m) => m.round === 0 && !m.bronze),
      a = first[0].a!,
      b = first[1].b!;
    for (const m of p.matches)
      t.documents.push({
        id: "pdf-" + m.id,
        phaseId: p.id,
        matchId: m.id,
        file: `documents/${m.id}.pdf`,
        pages: 1,
        revision: t.revision,
      });
    const next = applyCommand(t, {
        type: "bracket-swap",
        phaseId: p.id,
        teamA: a,
        teamB: b,
      }),
      q = getPhase(next, p.id);
    expect(q.matches[0].a).toBe(b);
    expect(q.matches[1].b).toBe(a);
    expect(p).toEqual(before);
    expect(q.previousRanks).toEqual(before.previousRanks);
    expect(q.seeds).toEqual(before.seeds);
    expect(q.teamIds).toEqual(before.teamIds);
    expect(q.matches.map((m) => m.id)).toEqual(before.matches.map((m) => m.id));
    expect(next.phases.filter((x) => x.id !== p.id)).toEqual(other);
    expect(
      next.documents.some(
        (d) => d.matchId === first[0].id || d.matchId === first[1].id,
      ),
    ).toBe(false);
    expect(next.documents.filter((d) => d.phaseId === p.id)).toHaveLength(
      before.matches.length - 2,
    );
    expect(decode(encode(next))).toEqual(next);
    t = applyCommand(next, {
      type: "score",
      phaseId: p.id,
      matchId: first[0].id,
      score: [21, 0],
    });
    const child = getPhase(t, p.id).matches.find((m) =>
      m.refs?.some((r) => r.type === "winner" && r.id === first[0].id),
    )!;
    expect([child.a, child.b]).toContain(b);
    expect(canSwapBracketTeams(getPhase(t, p.id))).toBe(false);
    t = applyCommand(t, { type: "random", phaseId: p.id });
    assertInvariants(t);
    expect(getPhase(t, p.id).status).toBe("Terminée");
    const semis = getPhase(t, p.id).matches.filter(
        (m) => m.round === Math.log2(n) - 2 && !m.bronze,
      ),
      bronze = getPhase(t, p.id).matches.find((m) => m.bronze)!;
    expect([bronze.a, bronze.b].sort()).toEqual(
      semis.map((m) => outcome(m, "loser")).sort(),
    );
  });
for (const n of [3, 5, 6, 7])
  it(`Byes follow swapped teams in a ${n}-team draw without counting as played matches`, () => {
    let t = tournament(n);
    const p = t.phases.at(-1)!,
      first = p.matches.filter((m) => m.round === 0 && !m.bronze);
    const bye = first.find((m) => m.bye)!,
      played = first.find((m) => !m.bye)!,
      a = (bye.a || bye.b)!,
      b = played.a!;
    const byesBefore = first.filter((m) => m.bye).length;
    expect(canSwapBracketTeams(p)).toBe(true);
    const changedMatches = p.matches.filter(
      (m) => m.a === a || m.b === a || m.a === b || m.b === b,
    );
    for (const m of p.matches)
      t.documents.push({
        id: "doc-" + m.id,
        phaseId: p.id,
        matchId: m.id,
        file: `documents/${m.id}.pdf`,
        pages: 1,
        revision: t.revision,
      });
    t = applyCommand(t, {
      type: "bracket-swap",
      phaseId: p.id,
      teamA: a,
      teamB: b,
    });
    const q = t.phases.at(-1)!;
    expect(
      outcome(
        q.matches.find((m) => m.id === bye.id)!,
        "winner",
      ),
    ).toBe(b);
    const child = q.matches.find((m) =>
      m.refs?.some((r) => r.type === "winner" && r.id === bye.id),
    )!;
    expect([child.a, child.b]).toContain(b);
    expect(q.matches.filter((m) => m.round === 0 && m.bye)).toHaveLength(
      byesBefore,
    );
    const participants = q.matches
      .filter((m) => m.round === 0)
      .flatMap((m) => [m.a, m.b])
      .filter(Boolean);
    expect(new Set(participants).size).toBe(n);
    for (const m of changedMatches)
      expect(t.documents.some((d) => d.matchId === m.id)).toBe(false);
    expect(canSwapBracketTeams(q)).toBe(true);
    expect(decode(encode(t))).toEqual(t);
    t = applyCommand(t, { type: "random", phaseId: p.id });
    expect(t.phases.at(-1)!.status).toBe("Terminée");
    assertInvariants(t);
  });
it("Swap rejects started phases, duplicate/foreign teams and group phases without changing saved state", () => {
  const t = tournament(8),
    p = t.phases.at(-1)!,
    a = p.teamIds[0],
    b = p.teamIds[1],
    before = encode(t);
  for (const [first, second] of [
    [a, a],
    [a, "unknown"],
    [a, t.splits[0].consolante[0]],
  ])
    expect(() =>
      applyCommand(t, {
        type: "bracket-swap",
        phaseId: p.id,
        teamA: first,
        teamB: second,
      }),
    ).toThrow();
  expect(() =>
    applyCommand(t, {
      type: "bracket-swap",
      phaseId: t.phases[0].id,
      teamA: a,
      teamB: b,
    }),
  ).toThrow("phase finale");
  expect(encode(t)).toBe(before);
  const m = p.matches.find((m) => m.a && m.b && !m.bye)!;
  const started = applyCommand(t, {
    type: "score",
    phaseId: p.id,
    matchId: m.id,
    score: [21, 0],
  });
  const saved = encode(started);
  expect(() =>
    applyCommand(started, {
      type: "bracket-swap",
      phaseId: p.id,
      teamA: a,
      teamB: b,
    }),
  ).toThrow("verrouillé");
  expect(encode(started)).toBe(saved);
  const forfeited = structuredClone(t);
  forfeited.phases.at(-1)!.matches[0].forfeit = a;
  expect(canSwapBracketTeams(forfeited.phases.at(-1)!)).toBe(false);
});
it("Ranks come from the latest group phase, preserve shared places and also work for older saved brackets", () => {
  let t = groupPhase(registered(12));
  t = playPhase(t, t.phases[0].id);
  t = splitTournament(t, 8);
  for (let i = 0; i < 2; i++) {
    t = groupPhase(t, "Principale", [4, 4]);
    t = playPhase(t, t.phases.at(-1)!.id);
  }
  const source = t.phases.at(-1)!,
    expected = Object.fromEntries(
      overallStandings(source).map((r) => [r.teamId, r.overallPlace!]),
    );
  t = finals(t, "Principale", 8);
  const p = t.phases.at(-1)!;
  expect(p.sourceId).toBe(source.id);
  expect(p.previousRanks).toEqual(expected);
  const legacy = structuredClone(t);
  delete legacy.phases.at(-1)!.previousRanks;
  expect(
    previousPhaseRanks(decode(encode(legacy)), legacy.phases.at(-1)!),
  ).toEqual(expected);
  const m = p.matches[0];
  t = applyCommand(t, {
    type: "bracket-swap",
    phaseId: p.id,
    teamA: m.a!,
    teamB: m.b!,
  });
  expect(t.phases.at(-1)!.matches[0].a).toBe(m.b);
  expect(t.phases.at(-1)!.previousRanks).toEqual(expected);
});

it("Statistically tied teams retain shared previous ranks rather than displaying their distinct seeding positions", () => {
  let t = groupPhase(registered(8), "Commun", [4, 4]);
  const pid = t.phases[0].id;
  for (const g of t.phases[0].groups)
    for (const m of t.phases[0].matches.filter((m) => m.groupId === g.id)) {
      t = applyCommand(t, {
        type: "score",
        phaseId: pid,
        matchId: m.id,
        score:
          g.teamIds.indexOf(m.a!) < g.teamIds.indexOf(m.b!)
            ? [21, 10]
            : [10, 21],
      });
    }
  t = splitTournament(t, 4);
  t = finals(t, "Principale", 4);
  expect(Object.values(t.phases.at(-1)!.previousRanks!).sort()).toEqual([
    1, 1, 3, 3,
  ]);
});
