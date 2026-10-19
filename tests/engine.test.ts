import { describe, it, expect } from "vitest";
import {
  applyCommand,
  assertInvariants,
  balancedGroups,
  correctionImpact,
  finalPlacements,
  getPhase,
  laneCandidates,
  normalize,
  outcome,
  rankingPlan,
  schedule,
  standings,
  strength,
  structures,
  validateScore,
} from "../src/domain/engine";
import {
  decisionsFor,
  finals,
  groupPhase,
  playPhase,
  registered,
  splitTournament,
} from "./helpers";

describe("Registration, structure and complete schedules", () => {
  it("A02–A03: category isolation, normalized duplicate detection, 3–4 players, collision-free overflow names", () => {
    let t = registered(90);
    expect(new Set(t.teams.map((x) => normalize(x.name))).size).toBe(90);
    expect(t.teams.some((x) => x.name === "Team 66")).toBe(true);
    expect(
      new Set(t.teams.flatMap((x) => x.players.map((p) => p.id))).size,
    ).toBe(t.teams.flatMap((x) => x.players).length);
    const team = {
      ...structuredClone(t.teams[0]),
      id: crypto.randomUUID(),
      name: " ÁIGLES  ",
      players: t.teams[0].players.map((p) => ({
        ...p,
        id: crypto.randomUUID(),
      })),
    };
    expect(() => applyCommand(t, { type: "team", team })).toThrow(
      "existe déjà",
    );
    t = applyCommand(t, {
      type: "team",
      team: { ...team, category: "Femmes" },
    });
    expect(t.teams.filter((x) => x.category === "Femmes")).toHaveLength(1);
    expect(strength(t.teams[0])).toBe(1);
  });
  it("A04: immediately recommends most preferred groups for 4→5→3→4", () => {
    for (const preferred of [4, 5, 3, 4]) {
      const all = structures(23, preferred);
      expect(all.length).toBeGreaterThan(0);
      expect(all[0].filter((x) => x === preferred).length).toBe(
        Math.max(...all.map((x) => x.filter((n) => n === preferred).length)),
      );
      all.forEach((s) => expect(s.reduce((a, b) => a + b)).toBe(23));
    }
    expect(structures(2)).toHaveLength(0);
  });
  for (const n of [3, 4, 5])
    for (const courts of [1, 2])
      it(`A05–A07: ${n} teams, ${courts} court(s), exact round robin and no simultaneous conflicts`, () => {
        const t = registered(n),
          g = balancedGroups(t.teams, [n])[0];
        if (courts === 2) g.courts.push("Terrain Érable 12");
        const ms = schedule("phase", g, 21);
        expect(ms).toHaveLength((n * (n - 1)) / 2);
        expect(new Set(ms.map((m) => [m.a, m.b].sort().join())).size).toBe(
          ms.length,
        );
        for (const slot of new Set(ms.map((m) => m.slot))) {
          const inSlot = ms.filter((m) => m.slot === slot);
          const teams = inSlot.flatMap((m) => [m.a, m.b]);
          expect(new Set(teams).size).toBe(teams.length);
          for (const m of inSlot)
            if (g.teamIds.includes(m.referee))
              expect(teams).not.toContain(m.referee);
        }
        if (n === 5 && courts === 2) {
          expect(new Set(ms.map((m) => m.slot)).size).toBe(5);
          expect(ms.filter((m) => m.court === g.courts[0])).toHaveLength(5);
        }
      });
});
describe("Scores, qualification and phase history", () => {
  it("A09–A10: zero, overtime, invalid results, idempotency and standings", () => {
    let t = groupPhase(registered(4)),
      p = t.phases[0],
      m = p.matches[0];
    const rules = p.rules;
    expect(() => validateScore([21, 0], 21, rules)).not.toThrow();
    expect(() => validateScore([30, 28], 25, rules)).not.toThrow();
    for (const invalid of [
      [25, 24],
      [27, 22],
      [0, 0],
      [21, -1],
      [21, NaN],
      [21, 21],
    ])
      expect(() =>
        validateScore(invalid as [number, number], 21, rules),
      ).toThrow();
    t = applyCommand(t, {
      type: "score",
      phaseId: p.id,
      matchId: m.id,
      score: [21, 0],
    });
    const once = t;
    expect(
      applyCommand(t, {
        type: "score",
        phaseId: p.id,
        matchId: m.id,
        score: [21, 0],
      }),
    ).toBe(once);
    const rows = standings(t.phases[0], p.groups[0]);
    expect(rows.find((r) => r.teamId === m.a)?.points).toBe(2);
    expect(rows.find((r) => r.teamId === m.b)?.points).toBe(1);
    expect(() =>
      applyCommand(t, {
        type: "score",
        phaseId: p.id,
        matchId: m.id,
        score: [21, 4],
      }),
    ).toThrow("correction");
    t = playPhase(t, p.id);
    expect(t.phases[0].status).toBe("Terminée");
  });
  it("A11: 17-team, 28/28 regression, exact split and repeated confirmation", () => {
    let t = groupPhase(registered(17), "Commun", [5, 4, 4, 4]);
    expect(t.phases[0].matches).toHaveLength(28);
    t = playPhase(t, t.phases[0].id);
    t = splitTournament(t, 8);
    expect(t.splits[0].principale).toHaveLength(8);
    expect(t.splits[0].consolante).toHaveLength(9);
    expect(
      new Set([...t.splits[0].principale, ...t.splits[0].consolante]).size,
    ).toBe(17);
    expect(
      applyCommand(t, {
        type: "split",
        phaseId: t.phases[0].id,
        count: 8,
        decisions: {},
      }),
    ).toBe(t);
    assertInvariants(t);
  });
  it("A12–A13: exact 104-score synthetic lifecycle, independent branches, Principale phase 3 and eight-team final", () => {
    // 23 = 5+5+5+5+3 -> 43; P 8 -> 12 + 12; C 15 -> 30; C knockout 7 incl byes -> 7 scored = 104.
    let t = groupPhase(registered(23), "Commun", [5, 5, 5, 5, 3]);
    t = playPhase(t, t.phases[0].id);
    t = splitTournament(t, 8);
    t = groupPhase(t, "Principale", [4, 4]);
    t = playPhase(t, t.phases.at(-1)!.id);
    t = groupPhase(t, "Consolante", [5, 5, 5]);
    t = playPhase(t, t.phases.at(-1)!.id);
    t = groupPhase(t, "Principale", [4, 4]);
    const p3 = t.phases.at(-1)!;
    t = playPhase(t, p3.id);
    t = finals(t, "Consolante", 7);
    t = playPhase(t, t.phases.at(-1)!.id);
    expect(
      t.phases.flatMap((x) => x.matches).filter((m) => m.score),
    ).toHaveLength(104);
    const before = JSON.stringify(
      t.phases.filter((p) => p.lane === "Consolante"),
    );
    t = finals(t, "Principale", 8);
    expect(
      JSON.stringify(t.phases.filter((p) => p.lane === "Consolante")),
    ).toBe(before);
    expect(t.phases.at(-1)!.sourceId).toBe(p3.id);
    expect(t.phases.at(-1)!.teamIds).toHaveLength(8);
    expect(getPhase(t, p3.id).status).toBe("Terminée");
    assertInvariants(t);
  });
  it("A14: irrelevant ties are ignored; relevant ties require complete context-specific named ordering", () => {
    let t = groupPhase(registered(8), "Commun", [4, 4]);
    const pid = t.phases[0].id;
    // Every group has an equal three-way cycle among the top three, and a fourth that loses all matches.
    for (const g of t.phases[0].groups) {
      const [a, b, c, d] = g.teamIds;
      for (const m of getPhase(t, pid).matches.filter(
        (x) => x.groupId === g.id,
      )) {
        const win =
          m.a === d
            ? m.b
            : m.b === d
              ? m.a
              : [a, b].includes(m.a!) && [a, b].includes(m.b!)
                ? a
                : [b, c].includes(m.a!) && [b, c].includes(m.b!)
                  ? b
                  : c;
        t = applyCommand(t, {
          type: "score",
          phaseId: pid,
          matchId: m.id,
          score: m.a === win ? [21, 10] : [10, 21],
        });
      }
    }
    const p = getPhase(t, pid);
    expect(rankingPlan(t, p, 6, "split").ties).toHaveLength(0);
    expect(rankingPlan(t, p, 4, "split").ties.length).toBeGreaterThan(0);
    expect(() =>
      applyCommand(t, { type: "split", phaseId: pid, count: 4, decisions: {} }),
    ).toThrow("égalité");
    t = splitTournament(t, 4);
    t = groupPhase(t, "Principale", [4]);
    t = playPhase(t, t.phases.at(-1)!.id);
    const next = t.phases.at(-1)!;
    expect(next.decisions).toEqual({});
    expect(
      Object.keys(p.decisions).some((key) =>
        Object.keys(next.decisions).includes(key),
      ),
    ).toBe(false);
  });
});
describe("Knockout and safe corrections", () => {
  for (const n of [4, 8, 16])
    it(`A16–A18: playable ${n}-team bracket, winner/loser dependencies, bronze and idempotent random scores`, () => {
      let t = groupPhase(registered(n + 4));
      t = playPhase(t, t.phases[0].id);
      t = splitTournament(t, n);
      t = finals(t, "Principale", n);
      const pid = t.phases.at(-1)!.id;
      t = applyCommand(t, { type: "random", phaseId: pid });
      const p = getPhase(t, pid);
      expect(p.status).toBe("Terminée");
      expect(p.matches.filter((m) => m.score)).toHaveLength(n);
      expect(
        finalPlacements(p)
          .slice(0, 4)
          .map((x) => x.place),
      ).toEqual([1, 2, 3, 4]);
      const semis = p.matches.filter(
          (m) => !m.bronze && m.round === Math.log2(n) - 2,
        ),
        final = p.matches.filter((m) => !m.bronze).at(-1)!,
        bronze = p.matches.find((m) => m.bronze)!;
      expect([final.a, final.b].sort()).toEqual(
        semis.map((m) => outcome(m, "winner")).sort(),
      );
      expect([bronze.a, bronze.b].sort()).toEqual(
        semis.map((m) => outcome(m, "loser")).sort(),
      );
      expect(applyCommand(t, { type: "random", phaseId: pid })).toBe(t);
      const m = p.matches[0],
        impact = correctionImpact(t, pid, m.id);
      expect(impact.matches.length).toBeGreaterThan(0);
      expect(() =>
        applyCommand(t, {
          type: "score",
          phaseId: pid,
          matchId: m.id,
          score: [m.score![1], m.score![0]],
          correction: true,
        }),
      ).toThrow("Confirmez");
      t = applyCommand(t, {
        type: "score",
        phaseId: pid,
        matchId: m.id,
        score: [m.score![1], m.score![0]],
        correction: true,
        acknowledge: true,
      });
      expect(getPhase(t, pid).status).toBe("En cours");
      expect((t.archives[0] as any).matches.every((m: any) => m.score)).toBe(
        true,
      );
      assertInvariants(t);
    });
  it("A17: changing common results archives both branches and split without losing history", () => {
    let t = groupPhase(registered(12));
    t = playPhase(t, t.phases[0].id);
    t = splitTournament(t, 8);
    t = groupPhase(t, "Principale", [4, 4]);
    t = playPhase(t, t.phases.at(-1)!.id);
    t = finals(t, "Consolante", 4);
    t = playPhase(t, t.phases.at(-1)!.id);
    const p = t.phases[0],
      m = p.matches[0];
    t = applyCommand(t, {
      type: "score",
      phaseId: p.id,
      matchId: m.id,
      score: [m.score![1], m.score![0]],
      correction: true,
      acknowledge: true,
    });
    expect(t.phases).toHaveLength(1);
    expect(t.splits).toHaveLength(0);
    expect((t.archives[0] as any).phases).toHaveLength(2);
    assertInvariants(t);
  });
});
