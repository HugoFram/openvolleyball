import type {
  Category,
  Command,
  Group,
  Lane,
  Match,
  Phase,
  Ref,
  Rules,
  Standing,
  Team,
  Tournament,
} from "./types";

export const id = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const defaultRules: Rules = {
  confirmed: false,
  margin: 2,
  crossGroup: "place-first",
  referee: "resting-or-external",
  bronze: true,
};
export const normalize = (s: string) =>
  s
    .trim()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("fr");
export const strength = (t: Team) =>
  t.players.length
    ? t.players.reduce((s, p) => s + p.level, 0) / t.players.length
    : 0;
export function createTournament(name: string): Tournament {
  check(
    name.trim().length > 0 && name.trim().length <= 120,
    "Donnez au tournoi un nom de 1 à 120 caractères.",
  );
  return {
    schema: 1,
    id: id(),
    name: name.trim(),
    createdAt: now(),
    modifiedAt: now(),
    revision: 0,
    rules: { ...defaultRules },
    teams: [],
    phases: [],
    splits: [],
    documents: [],
    audit: [],
    archives: [],
    preferredSize: 4,
  };
}
export function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
export function structures(n: number, preferred = 4): number[][] {
  const out: number[][] = [];
  for (let f = 0; f <= Math.floor(n / 5); f++)
    for (let q = 0; q <= Math.floor((n - 5 * f) / 4); q++) {
      const rest = n - 5 * f - 4 * q;
      if (rest >= 0 && rest % 3 === 0 && n > 0)
        out.push([
          ...Array(f).fill(5),
          ...Array(q).fill(4),
          ...Array(rest / 3).fill(3),
        ]);
    }
  return out.sort(
    (a, b) =>
      b.filter((x) => x === preferred).length -
        a.filter((x) => x === preferred).length ||
      a.length - b.length ||
      b.join("").localeCompare(a.join("")),
  );
}
export function balancedGroups(teams: Team[], sizes: number[]): Group[] {
  check(
    sizes.reduce((a, b) => a + b, 0) === teams.length &&
      sizes.every((x) => [3, 4, 5].includes(x)),
    "La structure doit répartir toutes les équipes par groupes de 3, 4 ou 5.",
  );
  const groups = sizes.map((_, i) => ({
    id: id(),
    name: `Groupe ${i + 1}`,
    teamIds: [] as string[],
    courts: [`${i + 1}`],
  }));
  const byId = new Map(teams.map((t) => [t.id, t]));
  const sorted = [...teams].sort((a, b) => strength(b) - strength(a));
  for (const team of sorted) {
    const available = groups.filter((g, i) => g.teamIds.length < sizes[i]);
    available.sort((a, b) => {
      // Equalize occupancy first; then give the strongest remaining team to the weakest group.
      const load =
        a.teamIds.length / sizes[groups.indexOf(a)] -
        b.teamIds.length / sizes[groups.indexOf(b)];
      return (
        load ||
        a.teamIds.reduce((s, t) => s + strength(byId.get(t)!), 0) /
          Math.max(1, a.teamIds.length) -
          b.teamIds.reduce((s, t) => s + strength(byId.get(t)!), 0) /
            Math.max(1, b.teamIds.length)
      );
    });
    available[0].teamIds.push(team.id);
  }
  return groups;
}
export function schedule(
  phaseId: string,
  group: Group,
  target: 21 | 25,
): Match[] {
  const ring: (string | null)[] = [...group.teamIds];
  if (ring.length % 2) ring.push(null);
  const out: Match[] = [];
  let serialSlot = 0;
  for (let round = 0; round < ring.length - 1; round++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < ring.length / 2; i++) {
      const a = ring[i],
        b = ring[ring.length - 1 - i];
      if (a && b) pairs.push([a, b]);
    }
    const used = new Set(pairs.flat());
    const resting = group.teamIds.find((t) => !used.has(t));
    for (let i = 0; i < pairs.length; i++) {
      const slot = group.courts.length === 2 ? round : serialSlot++;
      const idle =
        group.courts.length === 2
          ? resting
          : group.teamIds.find((t) => !pairs[i].includes(t));
      out.push({
        id: id(),
        phaseId,
        groupId: group.id,
        order: out.length + 1,
        slot,
        court: group.courts[i % group.courts.length],
        referee: idle || "Arbitre externe à désigner",
        a: pairs[i][0],
        b: pairs[i][1],
        round: 0,
        target,
        score: null,
      });
    }
    ring.splice(1, 0, ring.pop()!);
  }
  return out;
}
export function validateScore(
  score: [number, number],
  target: number,
  rules: Rules,
): void {
  check(
    Array.isArray(score) &&
      score.length === 2 &&
      score.every((x) => Number.isSafeInteger(x) && x >= 0 && x <= 999),
    "Deux scores entiers de 0 à 999 sont requis.",
  );
  const high = Math.max(...score),
    low = Math.min(...score);
  check(high >= target, "Le vainqueur doit atteindre " + target + " points.");
  check(high !== low, "Un match ne peut pas se terminer à égalité.");
  check(
    high - low >= rules.margin,
    `Le règlement impose ${rules.margin} point(s) d’écart.`,
  );
  check(
    high === target || high - low === rules.margin,
    `En prolongation, le match s’arrête au premier écart de ${rules.margin} point(s).`,
  );
}
export function standings(p: Phase, g: Group): Standing[] {
  const rows = g.teamIds.map((teamId) => ({
    teamId,
    played: 0,
    wins: 0,
    losses: 0,
    points: 0,
    scored: 0,
    conceded: 0,
    diff: 0,
    place: 0,
    groupId: g.id,
  }));
  const byId = new Map(rows.map((r) => [r.teamId, r]));
  for (const m of p.matches.filter((m) => m.groupId === g.id && m.score)) {
    const a = byId.get(m.a!),
      b = byId.get(m.b!);
    if (!a || !b) continue;
    const [sa, sb] = m.score!;
    a.played++;
    b.played++;
    a.scored += sa;
    a.conceded += sb;
    b.scored += sb;
    b.conceded += sa;
    const winner = sa > sb ? a : b,
      loser = sa > sb ? b : a;
    winner.wins++;
    winner.points += 2;
    loser.losses++;
    loser.points++;
  }
  rows.forEach((r) => (r.diff = r.scored - r.conceded));
  rows.sort((a, b) => b.points - a.points || b.diff - a.diff);
  rows.forEach(
    (r, i) =>
      (r.place =
        i > 0 && r.points === rows[i - 1].points && r.diff === rows[i - 1].diff
          ? rows[i - 1].place
          : i + 1),
  );
  return rows;
}
export function compareCross(a: Standing, b: Standing, rules: Rules): number {
  if (rules.crossGroup === "place-first" && a.place !== b.place)
    return a.place - b.place;
  return (
    b.points * Math.max(1, a.played) - a.points * Math.max(1, b.played) ||
    b.diff * Math.max(1, a.played) - a.diff * Math.max(1, b.played)
  );
}
export interface RankingPlan {
  rows: Standing[];
  ties: { key: string; rows: Standing[]; reason: string }[];
  context: string;
}
export function rankingPlan(
  t: Tournament,
  p: Phase,
  count: number,
  purpose: "split" | "seeds",
  candidateIds?: string[],
): RankingPlan {
  const eligible = new Set(candidateIds || p.teamIds);
  const withdrawn = new Set(
    t.teams.filter((x) => x.withdrawn).map((x) => x.id),
  );
  const rows = p.groups
    .flatMap((g) => standings(p, g))
    .filter((r) => eligible.has(r.teamId) && !withdrawn.has(r.teamId))
    .sort((a, b) => compareCross(a, b, p.rules));
  const ties: RankingPlan["ties"] = [];
  const context = `${purpose}:${count}`;
  for (let start = 0; start < rows.length;) {
    let end = start + 1;
    while (
      end < rows.length &&
      compareCross(rows[start], rows[end], p.rules) === 0
    )
      end++;
    if (
      end - start > 1 &&
      ((purpose === "split" && start < count && end > count) ||
        (purpose === "seeds" && start < count))
    ) {
      const block = rows.slice(start, end);
      const key = `${context}:${block
        .map((r) => r.teamId)
        .sort()
        .join(",")}`;
      ties.push({
        key,
        rows: block,
        reason:
          purpose === "split"
            ? `Cette égalité traverse la limite des ${count} places en Principale.`
            : `Cette égalité détermine les têtes de série ${start + 1} à ${Math.min(end, count)}.`,
      });
    }
    start = end;
  }
  return { rows, ties, context };
}
export function resolvePlan(
  plan: RankingPlan,
  decisions: Record<string, string[]>,
): string[] {
  const rows = [...plan.rows];
  for (const tie of plan.ties) {
    const order = decisions[tie.key];
    const ids = tie.rows.map((r) => r.teamId);
    check(
      order &&
        order.length === ids.length &&
        new Set(order).size === ids.length &&
        order.every((x) => ids.includes(x)),
      `${tie.reason} Choisissez un ordre complet pour les équipes à égalité.`,
    );
    const start = rows.findIndex((r) => r.teamId === ids[0]);
    rows.splice(
      start,
      ids.length,
      ...order.map((x) => tie.rows.find((r) => r.teamId === x)!),
    );
  }
  return rows.map((r) => r.teamId);
}
export function latest(
  t: Tournament,
  category: Category,
  lane: Lane,
): Phase | undefined {
  const phases = t.phases.filter(
    (p) => p.category === category && p.lane === lane,
  );
  return phases.find((p) => !phases.some((q) => q.sourceId === p.id));
}
export function laneCandidates(
  t: Tournament,
  category: Category,
  lane: Lane,
): { source: Phase | null; ids: string[]; number: number } {
  const last = latest(t, category, lane);
  if (last) {
    check(
      last.kind !== "knockout",
      "Cette branche possède déjà une phase finale.",
    );
    check(
      last.status === "Terminée",
      "Terminez la phase précédente avant de poursuivre.",
    );
    return {
      source: last,
      ids: last.teamIds.filter(
        (x) => !t.teams.find((z) => z.id === x)?.withdrawn,
      ),
      number: last.number + 1,
    };
  }
  if (lane === "Commun") {
    check(
      !t.phases.some((p) => p.category === category),
      "Les groupes initiaux existent déjà.",
    );
    return {
      source: null,
      ids: t.teams
        .filter((x) => x.category === category && !x.withdrawn)
        .map((x) => x.id),
      number: 1,
    };
  }
  const split = t.splits.find((s) => s.category === category);
  check(split, "Créez d’abord Principale / Consolante.");
  return {
    source: t.phases.find((p) => p.id === split.sourceId)!,
    ids: (lane === "Principale" ? split.principale : split.consolante).filter(
      (x) => !t.teams.find((z) => z.id === x)?.withdrawn,
    ),
    number: 2,
  };
}
function snapshot(t: Tournament, ids: string[]) {
  return {
    teamNames: Object.fromEntries(
      ids.map((x) => [x, t.teams.find((z) => z.id === x)!.name]),
    ),
    levels: Object.fromEntries(
      ids.map((x) => [x, strength(t.teams.find((z) => z.id === x)!)]),
    ),
  };
}
export function getPhase(t: Tournament, pid: string): Phase {
  const p = t.phases.find((x) => x.id === pid);
  check(p, "Cette phase n’existe pas dans le tournoi actif.");
  return p;
}
export function getMatch(p: Phase, mid: string): Match {
  const m = p.matches.find((x) => x.id === mid);
  check(m, "Ce match n’existe pas dans cette phase.");
  return m;
}
export function outcome(m: Match, kind: "winner" | "loser"): string | null {
  if (m.bye) return kind === "winner" ? m.a || m.b : null;
  if (!m.score) return null;
  const winner = m.score[0] > m.score[1] ? m.a : m.b;
  return kind === "winner" ? winner : winner === m.a ? m.b : m.a;
}
function refTeam(ref: Ref, p: Phase): string | null {
  return ref.type === "team"
    ? ref.id
    : ref.type === "bye"
      ? null
      : outcome(getMatch(p, ref.id), ref.type);
}
function refReady(ref: Ref, p: Phase): boolean {
  return (
    ref.type === "team" ||
    ref.type === "bye" ||
    !!(getMatch(p, ref.id).score || getMatch(p, ref.id).bye)
  );
}
export function refreshBracket(p: Phase) {
  for (const m of p.matches) {
    if (!m.refs) continue;
    const a = refTeam(m.refs[0], p),
      b = refTeam(m.refs[1], p);
    if (m.a !== a || m.b !== b) m.score = null;
    m.a = a;
    m.b = b;
    m.bye = refReady(m.refs[0], p) && refReady(m.refs[1], p) && (!a || !b);
  }
  complete(p);
}
function complete(p: Phase) {
  if (p.status !== "Préparation")
    p.status =
      p.matches.length > 0 && p.matches.every((m) => m.score || m.bye)
        ? "Terminée"
        : "En cours";
}
export function correctionImpact(
  t: Tournament,
  pid: string,
  mid: string,
): {
  phases: Phase[];
  matches: Match[];
  affectedMatches: Match[];
  splits: Tournament["splits"];
} {
  const p = getPhase(t, pid);
  getMatch(p, mid);
  const descendantIds = new Set([pid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const q of t.phases)
      if (
        q.sourceId &&
        descendantIds.has(q.sourceId) &&
        !descendantIds.has(q.id)
      ) {
        descendantIds.add(q.id);
        changed = true;
      }
  }
  const matchIds = new Set([mid]);
  for (const m of p.matches)
    if (m.refs?.some((r) => matchIds.has(r.id))) matchIds.add(m.id);
  return {
    phases: t.phases.filter((q) => q.id !== pid && descendantIds.has(q.id)),
    matches: p.matches.filter(
      (m) => m.id !== mid && matchIds.has(m.id) && m.score,
    ),
    affectedMatches: p.matches.filter(
      (m) => m.id !== mid && matchIds.has(m.id),
    ),
    splits: t.splits.filter((s) => descendantIds.has(s.sourceId)),
  };
}
function seedOrder(n: number): number[] {
  let seeds = [1, 2];
  while (seeds.length < n)
    seeds = seeds.flatMap((x) => [x, seeds.length * 2 + 1 - x]);
  return seeds;
}
function makeBracket(
  t: Tournament,
  source: Phase,
  lane: Lane,
  seeds: string[],
  c: Extract<Command, { type: "knockout" }>,
): Phase {
  const n = 2 ** Math.ceil(Math.log2(seeds.length));
  const pid = id();
  const p: Phase = {
    id: pid,
    category: source.category,
    lane,
    kind: "knockout",
    number: source.lane === lane ? source.number + 1 : 2,
    sourceId: source.id,
    status: "En cours",
    target: c.earlyTarget,
    groups: [],
    matches: [],
    teamIds: seeds,
    ...snapshot(t, seeds),
    createdAt: now(),
    rules: { ...t.rules },
    seeds,
    decisions: c.decisions,
  };
  const order = seedOrder(n);
  let refs: Ref[] = order.map((x) =>
    x <= seeds.length
      ? { type: "team", id: seeds[x - 1] }
      : { type: "bye", id: "" },
  );
  let round = 0;
  let semis: Match[] = [];
  while (refs.length > 1) {
    const next: Ref[] = [];
    const roundMatches: Match[] = [];
    for (let i = 0; i < refs.length; i += 2) {
      const m: Match = {
        id: id(),
        phaseId: pid,
        order: p.matches.length + 1,
        slot: round,
        court: "1",
        referee: "Arbitre externe à désigner",
        a: null,
        b: null,
        refs: [refs[i], refs[i + 1]],
        round,
        target: refs.length === 2 ? c.finalTarget : c.earlyTarget,
        score: null,
      };
      p.matches.push(m);
      roundMatches.push(m);
      next.push({ type: "winner", id: m.id });
    }
    if (refs.length === 4) semis = roundMatches;
    refs = next;
    round++;
  }
  if (c.bronze && semis.length === 2)
    p.matches.push({
      id: id(),
      phaseId: pid,
      order: p.matches.length + 1,
      slot: round - 1,
      court: "2",
      referee: "Arbitre externe à désigner",
      a: null,
      b: null,
      refs: semis.map((x) => ({ type: "loser", id: x.id })) as [Ref, Ref],
      round: round - 1,
      bronze: true,
      target: c.finalTarget,
      score: null,
    });
  refreshBracket(p);
  return p;
}
const demoNames = [
  "Aigles",
  "Alpines",
  "Éclairs",
  "Lynx",
  "Marmottes",
  "Comètes",
  "Chamois",
  "Faucons",
  "Orques",
  "Panthères",
  "Renards",
  "Tigres",
  "Hérons",
  "Bisons",
  "Loups",
  "Pumas",
  "Cobras",
  "Phénix",
  "Loutres",
  "Mistral",
  "Soleil",
  "Aurore",
  "Rivage",
  "Sommets",
];
export function applyCommand(original: Tournament, c: Command): Tournament {
  const t = structuredClone(original);
  let detail: unknown = c;
  let noChange = false;
  switch (c.type) {
    case "rules":
      check(
        !t.phases.some((p) => p.status !== "Préparation"),
        "Le règlement est figé dès la confirmation des groupes.",
      );
      check(
        [1, 2].includes(c.rules.margin) &&
          ["place-first", "performance"].includes(c.rules.crossGroup),
        "Règlement invalide.",
      );
      t.rules = { ...c.rules };
      break;
    case "team": {
      const team = c.team;
      check(
        ["Hommes", "Femmes"].includes(team.category),
        "Catégorie invalide.",
      );
      check(
        !t.phases.some(
          (p) => p.category === team.category && p.status !== "Préparation",
        ),
        "Les inscriptions de cette catégorie sont verrouillées. Utilisez le retrait pour les phases futures.",
      );
      check(
        team.name.trim().length > 0 && team.name.length <= 120,
        "Saisissez le nom de l’équipe (120 caractères maximum).",
      );
      check(
        !t.teams.some(
          (x) =>
            x.category === team.category &&
            x.id !== team.id &&
            normalize(x.name) === normalize(team.name),
        ),
        "Ce nom d’équipe existe déjà dans cette catégorie.",
      );
      check(
        team.players.length >= 1 && team.players.length <= 20,
        "Ajoutez de 1 à 20 joueurs. Les équipes de 3 ou 4 sont acceptées.",
      );
      check(
        team.players.every(
          (x) =>
            x.name.trim() &&
            x.name.length <= 120 &&
            Number.isInteger(x.level) &&
            x.level >= 0 &&
            x.level <= 3,
        ),
        "Chaque joueur doit avoir un nom et un niveau entier de 0 à 3.",
      );
      const old = t.teams.findIndex((x) => x.id === team.id);
      check(
        old >= 0 || !t.phases.some((p) => p.category === team.category),
        "Supprimez le brouillon de groupes avant d’ajouter une équipe. Les effectifs existants restent modifiables.",
      );
      check(
        old < 0 || t.teams[old].category === team.category,
        "Une équipe ne peut pas changer de catégorie.",
      );
      check(
        !t.teams.some(
          (x) =>
            x.id !== team.id &&
            x.players.some((p) => team.players.some((q) => q.id === p.id)),
        ),
        "Les joueurs doivent avoir des identifiants distincts.",
      );
      team.name = team.name.trim();
      if (old >= 0) t.teams[old] = team;
      else t.teams.push(team);
      for (const draft of t.phases.filter(
        (p) =>
          p.category === team.category &&
          p.status === "Préparation" &&
          p.teamIds.includes(team.id),
      )) {
        draft.teamNames[team.id] = team.name;
        draft.levels[team.id] = strength(team);
      }
      break;
    }
    case "withdraw": {
      const team = t.teams.find((x) => x.id === c.teamId);
      check(team, "Équipe introuvable.");
      team.withdrawn = c.withdrawn;
      break;
    }
    case "demo-teams": {
      check(
        !t.phases.some((p) => p.category === c.category),
        "Les inscriptions sont verrouillées pour cette catégorie.",
      );
      check(
        Number.isInteger(c.count) && c.count > 0 && c.count <= 200,
        "Choisissez de 1 à 200 équipes.",
      );
      const used = new Set(
        t.teams
          .filter((x) => x.category === c.category)
          .map((x) => normalize(x.name)),
      );
      let fallback = 1;
      for (let i = 0; i < c.count; i++) {
        let name = demoNames.find((x) => !used.has(normalize(x)));
        while (!name) {
          const candidate = `Team ${fallback++}`;
          if (!used.has(normalize(candidate))) name = candidate;
        }
        used.add(normalize(name));
        t.teams.push({
          id: id(),
          name,
          category: c.category,
          withdrawn: false,
          players: Array.from({ length: 3 + (i % 2) }, (_, j) => ({
            id: id(),
            name: `Joueur ${i + 1}.${j + 1}`,
            email: "",
            club: "",
            level: (i + j) % 4,
          })),
        });
      }
      break;
    }
    case "draft": {
      check(
        t.rules.confirmed,
        "Confirmez le règlement avant de préparer une phase.",
      );
      const { source, ids, number } = laneCandidates(t, c.category, c.lane);
      const teams = ids.map((x) => t.teams.find((z) => z.id === x)!);
      check(
        teams.length >= 3,
        "Il faut au moins 3 équipes actives pour une phase de groupes.",
      );
      if (c.preferredSize && [3, 4, 5].includes(c.preferredSize))
        t.preferredSize = c.preferredSize;
      const p: Phase = {
        id: id(),
        category: c.category,
        lane: c.lane,
        kind: "groups",
        number,
        sourceId: source?.id || null,
        status: "Préparation",
        target: c.target,
        groups: balancedGroups(teams, c.structure),
        matches: [],
        teamIds: ids,
        ...snapshot(t, ids),
        createdAt: now(),
        rules: { ...t.rules },
        decisions: {},
      };
      t.phases.push(p);
      break;
    }
    case "draft-update": {
      const p = getPhase(t, c.phaseId);
      check(p.status === "Préparation", "Cette phase est déjà confirmée.");
      const all = c.groups.flatMap((g) => g.teamIds);
      check(
        all.length === p.teamIds.length &&
          new Set(all).size === all.length &&
          all.every((x) => p.teamIds.includes(x)),
        "Chaque équipe doit apparaître exactement une fois.",
      );
      check(
        c.groups.length === p.groups.length &&
          c.groups.every(
            (g) =>
              g.teamIds.length ===
              p.groups.find((x) => x.id === g.id)?.teamIds.length,
          ),
        "Les échanges doivent conserver la capacité des groupes.",
      );
      check(
        c.groups.every(
          (g) =>
            g.courts.length >= 1 &&
            g.courts.length <= 2 &&
            g.courts.every((x) => x.trim().length > 0 && x.length <= 40) &&
            new Set(g.courts.map(normalize)).size === g.courts.length,
        ),
        "Indiquez un ou deux terrains distincts par groupe (40 caractères maximum).",
      );
      p.groups = c.groups;
      p.target = c.target;
      break;
    }
    case "draft-delete": {
      const p = getPhase(t, c.phaseId);
      check(
        p.status === "Préparation",
        "Seul un brouillon peut être supprimé.",
      );
      t.phases = t.phases.filter((x) => x.id !== p.id);
      break;
    }
    case "confirm": {
      const p = getPhase(t, c.phaseId);
      if (p.status !== "Préparation") {
        noChange = true;
        break;
      }
      check(
        !p.groups.some((g) => g.courts.some((c) => !c.trim())),
        "Renseignez tous les terrains.",
      );
      check(
        t.rules.confirmed,
        "Confirmez le règlement avant le début de la phase.",
      );
      p.rules = { ...t.rules };
      p.matches = p.groups.flatMap((g) => schedule(p.id, g, p.target));
      p.status = "En cours";
      break;
    }
    case "score": {
      const p = getPhase(t, c.phaseId),
        m = getMatch(p, c.matchId);
      check(
        p.status !== "Préparation",
        "Confirmez les groupes avant de saisir un score.",
      );
      check(m.a && m.b && !m.bye, "Les deux participants doivent être connus.");
      validateScore(c.score, m.target, p.rules);
      if (m.score?.every((x, i) => x === c.score[i])) {
        noChange = true;
        break;
      }
      if (m.score) {
        check(
          c.correction,
          "Ce résultat existe déjà. Ouvrez la correction explicite.",
        );
        const impact = correctionImpact(t, p.id, m.id);
        check(
          c.acknowledge ||
            (!impact.phases.length &&
              !impact.matches.length &&
              !impact.splits.length),
          "La correction invalide des phases ou résultats suivants. Confirmez les conséquences.",
        );
        t.archives.push(
          structuredClone({
            at: now(),
            reason: "Correction",
            match: m,
            phases: impact.phases,
            matches: impact.affectedMatches,
            splits: impact.splits,
            documents: t.documents.filter(
              (d) =>
                impact.phases.some((q) => q.id === d.phaseId) ||
                impact.affectedMatches.some((x) => x.id === d.matchId),
            ),
          }),
        );
        t.phases = t.phases.filter(
          (q) => !impact.phases.some((z) => z.id === q.id),
        );
        t.splits = t.splits.filter(
          (s) =>
            s.sourceId !== p.id &&
            !impact.phases.some((z) => z.id === s.sourceId),
        );
        t.documents = t.documents.filter(
          (d) =>
            !impact.phases.some((z) => z.id === d.phaseId) &&
            !impact.affectedMatches.some((x) => x.id === d.matchId),
        );
        impact.affectedMatches.forEach((x) => (x.score = null));
        p.decisions = {};
        detail = {
          ...c,
          previous: m.score,
          invalidatedPhases: impact.phases.map((x) => x.id),
          invalidatedMatches: impact.matches.map((x) => x.id),
        };
      }
      m.score = c.score;
      if (p.kind === "knockout") refreshBracket(p);
      else complete(p);
      break;
    }
    case "random": {
      const p = getPhase(t, c.phaseId);
      check(p.status !== "Préparation", "Confirmez les groupes.");
      let count = 0;
      // Ordered traversal means a final can become eligible after its semifinal in the same explicit operation.
      for (const m of p.matches)
        if (!m.score && !m.bye && m.a && m.b) {
          const low = Math.floor(
            Math.random() * (m.target - p.rules.margin + 1),
          );
          m.score = Math.random() > 0.5 ? [m.target, low] : [low, m.target];
          validateScore(m.score, m.target, p.rules);
          count++;
          if (p.kind === "knockout") refreshBracket(p);
        }
      complete(p);
      noChange = count === 0;
      detail = { type: c.type, phaseId: p.id, count };
      break;
    }
    case "split": {
      const p = getPhase(t, c.phaseId);
      const existing = t.splits.find((s) => s.category === p.category);
      if (existing) {
        check(
          existing.sourceId === p.id && existing.principale.length === c.count,
          "Une répartition existe déjà.",
        );
        noChange = true;
        break;
      }
      check(
        p.lane === "Commun" && p.kind === "groups" && p.status === "Terminée",
        "Terminez tous les matchs des groupes initiaux.",
      );
      const plan = rankingPlan(t, p, c.count, "split");
      check(
        Number.isInteger(c.count) &&
          c.count >= 2 &&
          c.count <= plan.rows.length - 2,
        "Prévoyez au moins 2 équipes dans chaque branche.",
      );
      const ranking = resolvePlan(plan, c.decisions);
      p.decisions = { ...p.decisions, ...c.decisions };
      t.splits.push({
        id: id(),
        category: p.category,
        sourceId: p.id,
        principale: ranking.slice(0, c.count),
        consolante: ranking.slice(c.count),
        ranking,
        createdAt: now(),
      });
      break;
    }
    case "knockout": {
      const source = getPhase(t, c.phaseId);
      const existing = t.phases.find(
        (p) =>
          p.category === source.category &&
          p.lane === c.lane &&
          p.kind === "knockout",
      );
      if (existing) {
        noChange = true;
        break;
      }
      check(
        c.lane !== "Commun",
        "Créez d’abord les branches Principale / Consolante.",
      );
      const eligible = laneCandidates(t, source.category, c.lane);
      check(
        eligible.source?.id === source.id && source.status === "Terminée",
        "Sélectionnez la dernière phase terminée de cette branche.",
      );
      const plan = rankingPlan(t, source, c.count, "seeds", eligible.ids);
      check(
        Number.isInteger(c.count) &&
          c.count >= 2 &&
          c.count <= 64 &&
          c.count <= plan.rows.length,
        "Choisissez de 2 à 64 participants disponibles.",
      );
      const seeds = resolvePlan(plan, c.decisions).slice(0, c.count);
      t.phases.push(makeBracket(t, source, c.lane, seeds, c));
      break;
    }
    case "match-details": {
      const p = getPhase(t, c.phaseId),
        m = getMatch(p, c.matchId);
      check(
        c.court.trim() &&
          c.court.length <= 40 &&
          c.referee.trim() &&
          c.referee.length <= 120,
        "Indiquez un terrain et un arbitre.",
      );
      if (m.groupId)
        check(
          p.groups
            .find((g) => g.id === m.groupId)!
            .courts.includes(c.court.trim()),
          "Choisissez un terrain déjà configuré pour ce groupe.",
        );
      m.court = c.court.trim();
      m.referee = c.referee.trim();
      t.documents = t.documents.filter(
        (d) => d.matchId !== m.id && (!m.groupId || d.groupId !== m.groupId),
      );
      break;
    }
    default:
      throw new Error("Action non reconnue.");
  }
  if (noChange) return original;
  t.revision++;
  t.modifiedAt = now();
  t.audit.push({
    id: id(),
    at: now(),
    action: c.type,
    detail,
    revision: t.revision,
  });
  assertInvariants(t);
  return t;
}
export function assertInvariants(t: Tournament) {
  check(
    t.schema === 1 &&
      typeof t.id === "string" &&
      typeof t.name === "string" &&
      Number.isInteger(t.revision),
    "Format de package non reconnu.",
  );
  check(
    Array.isArray(t.teams) &&
      Array.isArray(t.phases) &&
      Array.isArray(t.splits) &&
      Array.isArray(t.documents) &&
      Array.isArray(t.audit) &&
      Array.isArray(t.archives),
    "Package incomplet.",
  );
  const teamIds = new Set(t.teams.map((x) => x.id));
  check(teamIds.size === t.teams.length, "Identifiants d’équipe dupliqués.");
  const playerIds = t.teams.flatMap((team) =>
    team.players.map((player) => player.id),
  );
  check(
    new Set(playerIds).size === playerIds.length,
    "Identifiants de joueur dupliqués.",
  );
  for (const category of ["Hommes", "Femmes"] as Category[]) {
    const names = t.teams
      .filter((team) => team.category === category)
      .map((team) => normalize(team.name));
    check(
      new Set(names).size === names.length && names.every(Boolean),
      "Noms d’équipe manquants ou dupliqués.",
    );
    check(
      t.splits.filter((s) => s.category === category).length <= 1,
      "Répartition de catégorie dupliquée.",
    );
  }
  const phaseIds = new Set(t.phases.map((x) => x.id));
  check(phaseIds.size === t.phases.length, "Identifiants de phase dupliqués.");
  const matches = new Set<string>();
  const groupIds = t.phases.flatMap((p) => p.groups.map((g) => g.id));
  check(
    new Set(groupIds).size === groupIds.length,
    "Identifiants de groupe dupliqués.",
  );
  for (const p of t.phases) {
    check(
      p.teamIds.every(
        (tid) =>
          t.teams.find((team) => team.id === tid)?.category === p.category,
      ),
      "Une phase mélange les catégories.",
    );
    let ancestor: Phase | undefined = p;
    const seen = new Set<string>();
    while (ancestor) {
      check(!seen.has(ancestor.id), "Cycle dans la progression.");
      seen.add(ancestor.id);
      ancestor = t.phases.find((q) => q.id === ancestor!.sourceId);
    }
    if (p.sourceId) {
      const source = getPhase(t, p.sourceId);
      check(
        source.category === p.category &&
          source.status === "Terminée" &&
          source.kind === "groups" &&
          p.teamIds.every((x) => source.teamIds.includes(x)),
        "Dépendance de phase incohérente.",
      );
      check(
        t.phases.filter((q) => q.lane === p.lane && q.sourceId === p.sourceId)
          .length === 1,
        "Plusieurs successeurs dans une même branche.",
      );
      check(
        p.number === (source.lane === p.lane ? source.number + 1 : 2),
        "Numéro de phase incohérent.",
      );
    } else
      check(
        p.lane === "Commun" && p.number === 1 && p.kind === "groups",
        "Racine de progression invalide.",
      );
    if (p.lane !== "Commun") {
      const split = t.splits.find((s) => s.category === p.category);
      check(
        split &&
          p.teamIds.every((x) =>
            (p.lane === "Principale"
              ? split.principale
              : split.consolante
            ).includes(x),
          ),
        "Participants hors de leur branche qualifiée.",
      );
    }
    check(
      p.teamIds.every((x) => teamIds.has(x)) &&
        new Set(p.teamIds).size === p.teamIds.length,
      "Participants de phase incohérents.",
    );
    check(!p.sourceId || phaseIds.has(p.sourceId), "Phase source manquante.");
    check([21, 25].includes(p.target), "Cible de score invalide.");
    if (p.kind === "groups") {
      const ids = p.groups.flatMap((g) => g.teamIds);
      check(
        ids.length === p.teamIds.length &&
          new Set(ids).size === ids.length &&
          ids.every((x) => p.teamIds.includes(x)),
        "Groupes incohérents.",
      );
      check(
        p.groups.every((g) => [3, 4, 5].includes(g.teamIds.length)),
        "Taille de groupe invalide.",
      );
    }
    for (const m of p.matches) {
      check(!matches.has(m.id), "Match dupliqué.");
      matches.add(m.id);
      check(
        m.phaseId === p.id &&
          (!m.a || p.teamIds.includes(m.a)) &&
          (!m.b || p.teamIds.includes(m.b)) &&
          (!m.a || m.a !== m.b),
        "Participants de match incohérents.",
      );
      if (m.score) {
        check(m.a && m.b, "Résultat sans participants.");
        if (!m.forfeit) validateScore(m.score, m.target, p.rules);
      }
    }
    if (p.status !== "Préparation" && p.kind === "groups")
      for (const g of p.groups) {
        const ms = p.matches.filter((m) => m.groupId === g.id);
        check(
          ms.length === (g.teamIds.length * (g.teamIds.length - 1)) / 2,
          "Calendrier incomplet.",
        );
        const pairs = ms.map((m) => [m.a, m.b].sort().join(","));
        check(
          new Set(pairs).size === pairs.length,
          "Paire de matchs dupliquée.",
        );
        for (const slot of new Set(ms.map((m) => m.slot))) {
          const courts = ms.filter((m) => m.slot === slot).map((m) => m.court);
          check(
            new Set(courts).size === courts.length,
            "Deux rencontres occupent le même terrain au même tour.",
          );
          const ids = ms
            .filter((m) => m.slot === slot)
            .flatMap((m) => [m.a, m.b]);
          check(
            new Set(ids).size === ids.length,
            "Une équipe joue deux matchs simultanés.",
          );
        }
      }
    check(
      p.status === "Préparation" ||
        p.status ===
          (p.matches.length && p.matches.every((m) => m.score || m.bye)
            ? "Terminée"
            : "En cours"),
      "Statut de phase incohérent.",
    );
  }
  for (const s of t.splits) {
    check(phaseIds.has(s.sourceId), "Source de qualification absente.");
    const ids = [...s.principale, ...s.consolante];
    check(
      new Set(ids).size === ids.length && ids.every((x) => teamIds.has(x)),
      "Répartition dupliquée ou incohérente.",
    );
  }
  for (const d of t.documents) {
    check(
      phaseIds.has(d.phaseId) && /^documents\/[a-zA-Z0-9-]+\.pdf$/.test(d.file),
      "Association de document invalide.",
    );
    const p = getPhase(t, d.phaseId);
    check(
      (!d.groupId || p.groups.some((g) => g.id === d.groupId)) &&
        (!d.matchId || p.matches.some((m) => m.id === d.matchId)),
      "Source de document introuvable.",
    );
  }
}
export function finalPlacements(p: Phase): { place: number; teamId: string }[] {
  if (p.kind !== "knockout") return [];
  const final = p.matches.filter((m) => !m.bronze).at(-1),
    bronze = p.matches.find((m) => m.bronze);
  const rows: { place: number; teamId: string }[] = [];
  if (final?.score) {
    rows.push(
      { place: 1, teamId: outcome(final, "winner")! },
      { place: 2, teamId: outcome(final, "loser")! },
    );
  }
  if (bronze?.score)
    rows.push(
      { place: 3, teamId: outcome(bronze, "winner")! },
      { place: 4, teamId: outcome(bronze, "loser")! },
    );
  else if (bronze?.bye && outcome(bronze, "winner"))
    rows.push({ place: 3, teamId: outcome(bronze, "winner")! });
  for (const m of p.matches.filter(
    (m) => !m.bronze && m !== final && m.score,
  )) {
    const loser = outcome(m, "loser");
    if (loser && !rows.some((r) => r.teamId === loser))
      rows.push({
        place: 2 ** (Math.max(...p.matches.map((x) => x.round)) - m.round) + 1,
        teamId: loser,
      });
  }
  return rows.sort((a, b) => a.place - b.place);
}
