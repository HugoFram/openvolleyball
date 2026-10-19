import fs from "node:fs/promises";
import path from "node:path";
import {
  applyCommand,
  getPhase,
  now,
  rankingPlan,
  structures,
} from "../src/domain/engine";
import type { Lane, Phase, Tournament } from "../src/domain/types";
import { encode } from "../electron/store";
import { makeSheet } from "../electron/pdf";
const dest = path.resolve("examples");
await fs.mkdir(dest, { recursive: true });
const decisions = (
  t: Tournament,
  p: Phase,
  n: number,
  purpose: "split" | "seeds",
  ids?: string[],
) =>
  Object.fromEntries(
    rankingPlan(t, p, n, purpose, ids).ties.map((tie) => [
      tie.key,
      tie.rows.map((r) => r.teamId),
    ]),
  );
async function save(name: string, t: Tournament) {
  const folder = path.join(dest, name + ".openvolley");
  await fs.mkdir(folder);
  await fs.mkdir(path.join(folder, "history"));
  await fs.writeFile(path.join(folder, "history", ".gitkeep"), "");
  await fs.mkdir(path.join(folder, "documents"));
  for (const p of t.phases.filter(
    (x) => x.kind === "groups" && x.status !== "Préparation",
  ))
    for (const g of p.groups)
      t.documents.push(
        await makeSheet(t, p, folder, path.resolve("assets/fonts"), g),
      );
  await fs.writeFile(path.join(folder, "tournament.json"), encode(t));
  console.log(
    `${name}: ${t.phases.flatMap((p) => p.matches).filter((m) => m.score).length} scores, ${t.documents.length} PDFs`,
  );
}
function groups(t: Tournament, lane: Lane, sizes: number[]) {
  t = applyCommand(t, {
    type: "draft",
    category: "Hommes",
    lane,
    structure: sizes,
    target: 21,
  });
  const p = t.phases.at(-1)!;
  if (p.number === 1) {
    const gs = structuredClone(p.groups);
    gs.filter((g) => g.teamIds.length === 5).forEach((g) =>
      g.courts.push(g.courts[0] + "B"),
    );
    t = applyCommand(t, {
      type: "draft-update",
      phaseId: p.id,
      groups: gs,
      target: 21,
    });
  }
  return applyCommand(t, { type: "confirm", phaseId: p.id });
}
function play(t: Tournament, pid: string) {
  const total = getPhase(t, pid).matches.length;
  for (let i = 0; i < total; i++) {
    const m = getPhase(t, pid).matches[i];
    if (m.a && m.b && !m.bye && !m.score)
      t = applyCommand(t, {
        type: "score",
        phaseId: pid,
        matchId: m.id,
        score: i % 2 ? [m.target, i % 19] : [i % 19, m.target],
      });
  }
  return t;
}
const { createTournament } = await import("../src/domain/engine");
function base(name: string, n: number) {
  let t = createTournament(name);
  t = applyCommand(t, {
    type: "rules",
    rules: { ...t.rules, confirmed: true },
  });
  t = applyCommand(t, { type: "demo-teams", category: "Hommes", count: n });
  return applyCommand(t, { type: "demo-teams", category: "Femmes", count: 8 });
}
let first = groups(
  base("Exemple E0050 · 17 équipes", 17),
  "Commun",
  [5, 4, 4, 4],
);
first = play(first, first.phases[0].id);
await save("01 - 17 équipes - qualification à faire", first);
let t = groups(
  base("Tournoi des Alpes · 104 résultats", 23),
  "Commun",
  [5, 5, 5, 5, 3],
);
t = play(t, t.phases[0].id);
const initial = t.phases[0];
t = applyCommand(t, {
  type: "split",
  phaseId: initial.id,
  count: 8,
  decisions: decisions(t, initial, 8, "split"),
});
t = groups(t, "Principale", [4, 4]);
t = play(t, t.phases.at(-1)!.id);
t = groups(t, "Consolante", [5, 5, 5]);
t = play(t, t.phases.at(-1)!.id);
t = groups(t, "Principale", [4, 4]);
t = play(t, t.phases.at(-1)!.id);
const c = t.phases.find((p) => p.lane === "Consolante")!;
t = applyCommand(t, {
  type: "knockout",
  phaseId: c.id,
  lane: "Consolante",
  count: 7,
  decisions: decisions(t, c, 7, "seeds", t.splits[0].consolante),
  earlyTarget: 21,
  finalTarget: 25,
  bronze: true,
});
t = play(t, t.phases.at(-1)!.id);
await save(
  "02 - 104 résultats - finale Principale à créer",
  structuredClone(t),
);
const p = t.phases.find((p) => p.lane === "Principale" && p.number === 3)!;
t = applyCommand(t, {
  type: "knockout",
  phaseId: p.id,
  lane: "Principale",
  count: 8,
  decisions: decisions(t, p, 8, "seeds", t.splits[0].principale),
  earlyTarget: 21,
  finalTarget: 25,
  bronze: true,
});
await save("03 - Tableau Principale prêt à jouer", t);
