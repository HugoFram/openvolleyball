import {
  applyCommand,
  createTournament,
  getPhase,
  rankingPlan,
  laneCandidates,
  structures,
} from "../src/domain/engine";
import type { Category, Lane, Phase, Tournament } from "../src/domain/types";
export const decisionsFor = (
  t: Tournament,
  p: Phase,
  count: number,
  purpose: "split" | "seeds" | "groups",
  ids?: string[],
  sizes?: number[],
) =>
  Object.fromEntries(
    rankingPlan(t, p, count, purpose, ids, sizes).ties.map((tie) => [
      tie.key,
      tie.rows.map((r) => r.teamId),
    ]),
  );
export function registered(n: number, category: Category = "Hommes") {
  let t = createTournament("Tournoi de test – Élévation");
  t = applyCommand(t, {
    type: "rules",
    rules: { ...t.rules, confirmed: true },
  });
  return applyCommand(t, { type: "demo-teams", category, count: n });
}
export function groupPhase(
  t: Tournament,
  lane: Lane = "Commun",
  sizes?: number[],
  category: Category = "Hommes",
) {
  const count =
    lane === "Commun"
      ? t.teams.filter((x) => x.category === category).length
      : t.splits.find((x) => x.category === category)![
          lane === "Principale" ? "principale" : "consolante"
        ].length;
  const structure = sizes || structures(count)[0];
  const { source, ids } = laneCandidates(t, category, lane);
  t = applyCommand(t, {
    type: "draft",
    category,
    lane,
    structure,
    decisions: source
      ? decisionsFor(t, source, ids.length, "groups", ids, structure)
      : {},
    target: 21,
  });
  const p = t.phases.at(-1)!;
  t = applyCommand(t, { type: "confirm", phaseId: p.id });
  return t;
}
export function playPhase(t: Tournament, pid: string) {
  const p = getPhase(t, pid);
  for (let i = 0; i < p.matches.length; i++) {
    const m = getPhase(t, pid).matches[i];
    if (!m.score && m.a && m.b && !m.bye)
      t = applyCommand(t, {
        type: "score",
        phaseId: pid,
        matchId: m.id,
        score:
          i % 2
            ? [m.target, Math.min(m.target - 2, i % 19)]
            : [Math.min(m.target - 2, i % 19), m.target],
      });
  }
  return t;
}
export function splitTournament(t: Tournament, count: number) {
  const p = t.phases.find(
    (x) => x.lane === "Commun" && x.category === "Hommes",
  )!;
  return applyCommand(t, {
    type: "split",
    phaseId: p.id,
    count,
    decisions: decisionsFor(t, p, count, "split"),
  });
}
export function finals(t: Tournament, lane: Lane, count: number) {
  const p =
    t.phases.filter((x) => x.lane === lane && x.category === "Hommes").at(-1) ||
    t.phases.find((x) => x.lane === "Commun")!;
  const s = t.splits[0];
  const ids = lane === "Principale" ? s.principale : s.consolante;
  return applyCommand(t, {
    type: "knockout",
    phaseId: p.id,
    lane,
    count,
    decisions: decisionsFor(t, p, count, "seeds", ids),
    earlyTarget: 21,
    finalTarget: 25,
    bronze: true,
  });
}
