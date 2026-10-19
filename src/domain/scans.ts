import type { Category, Tournament, Command, Team } from "./types";
import { applyCommand, check, id, now } from "./engine";

export type Rect = [number, number, number, number];
export interface PaperField {
  key: string;
  label: string;
  rect: Rect;
  digits?: Rect[];
  choices?: { value: string; rect: Rect }[];
  matchId?: string;
  side?: 0 | 1;
}
export interface PaperForm {
  id: string;
  documentId: string;
  tournamentId: string;
  version: 1;
  page: number;
  kind: "scores" | "registration";
  label: string;
  category: Category;
  phaseId?: string;
  groupId?: string;
  teamId?: string;
  sourceHash?: string;
  qr: Rect;
  fields: PaperField[];
  participants: Record<string, [string | null, string | null]>;
}
export interface ScanSource {
  id: string;
  name: string;
  file: string;
  hash: string;
  importedAt: string;
  processed?: boolean;
  error?: string;
}
export interface ScanValue {
  value: string;
  confidence?: number;
}
export interface ScanPage {
  id: string;
  sourceId: string;
  page: number;
  formId?: string;
  image: string;
  status: "pending" | "approved" | "ignored";
  values: Record<string, ScanValue>;
  note?: string;
  approvedAt?: string;
  accepted?: Record<string, string>;
  appliedIds?: string[];
}
export const qrPayload = (form: PaperForm) =>
  `OV2:${form.tournamentId}:${form.id}`;

/** Reject stale fixtures even if a scan was reviewed before a draw change. */
export function currentForm(t: Tournament, formId: string): PaperForm {
  const form = t.paperForms?.find((f) => f.id === formId);
  check(form, "Cette feuille n’est pas identifiée dans ce tournoi.");
  check(
    form.tournamentId === t.id,
    "Cette feuille appartient à un autre tournoi.",
  );
  if (form.kind === "scores") {
    const p = t.phases.find((p) => p.id === form.phaseId);
    check(
      p && p.status !== "Préparation",
      "La phase de cette feuille n’est plus active.",
    );
    const document = t.documents.find((d) => d.id === form.documentId);
    check(
      document && document.sourceHash === form.sourceHash,
      "Cette feuille a été remplacée. Importez la feuille actuelle ou saisissez les résultats dans la phase.",
    );
    for (const [mid, pair] of Object.entries(form.participants)) {
      const m = p.matches.find((m) => m.id === mid);
      check(
        m && m.a === pair[0] && m.b === pair[1],
        "Les participants ont changé depuis l’impression.",
      );
    }
  }
  return form;
}

/** All-or-nothing review: only explicit, complete pairs become domain commands. */
export function approveScan(
  t: Tournament,
  scanId: string,
  accepted: Record<string, string>,
): Tournament {
  const scan = t.scanPages?.find((s) => s.id === scanId);
  check(
    scan && scan.status === "pending" && scan.formId,
    "Cette feuille ne peut plus être validée.",
  );
  const form = currentForm(t, scan.formId);
  let next = t;
  const applied: string[] = [];
  const allowed = new Set(form.fields.map((f) => f.key));
  check(
    Object.keys(accepted).every((key) => allowed.has(key)),
    "Champ de feuille inconnu.",
  );
  if (form.kind === "registration") {
    const players: Team["players"] = [];
    for (let i = 0; i < 4; i++) {
      const read = (field: string) =>
        (accepted[`player${i}:${field}`] || "").trim();
      if (!["name", "level", "email", "club"].some((f) => read(f))) continue;
      const letter = read("level").toUpperCase();
      check(
        ["N", "R", "D", "U"].includes(letter),
        "Choisissez le niveau N, R, D ou U de chaque joueur.",
      );
      players.push({
        id: id(),
        name: read("name"),
        level: { N: 3, R: 2, D: 1, U: 0 }[letter]!,
        email: read("email"),
        club: read("club"),
      });
    }
    const teamId = form.teamId || id();
    const previous = t.teams.find((team) => team.id === teamId);
    next = applyCommand(next, {
      type: "team",
      team: {
        id: teamId,
        name: (accepted.teamName || "").trim(),
        category: form.category,
        players,
        withdrawn: previous?.withdrawn || false,
      },
    });
    applied.push(teamId);
  }
  for (const mid of Object.keys(form.participants)) {
    const fields = form.fields
      .filter((f) => f.matchId === mid)
      .sort((a, b) => a.side! - b.side!);
    const values = fields.map((f) => (accepted[f.key] || "").trim());
    if (values.every((s) => !s)) continue;
    check(
      values.length === 2 && values.every((s) => /^\d{1,3}$/.test(s)),
      "Complétez les deux scores ou laissez les deux vides.",
    );
    const score = values.map(Number) as [number, number];
    const match = next.phases
      .find((p) => p.id === form.phaseId)!
      .matches.find((m) => m.id === mid)!;
    check(
      !match.forfeit,
      "Un forfait existe déjà. Corrigez-le depuis la phase.",
    );
    check(
      !match.score || match.score.every((v, i) => v === score[i]),
      "Un résultat différent existe déjà. Utilisez la correction depuis la phase.",
    );
    next = applyCommand(next, {
      type: "score",
      phaseId: form.phaseId!,
      matchId: mid,
      score,
    } as Command);
    applied.push(mid);
  }
  check(applied.length, "Saisissez au moins un résultat complet à valider.");
  next = structuredClone(next);
  const stored = next.scanPages!.find((s) => s.id === scanId)!;
  stored.status = "approved";
  stored.accepted = accepted;
  stored.approvedAt = now();
  stored.appliedIds = applied;
  // A reviewed sheet is one persistence transaction, even with several scores.
  next.revision = t.revision + 1;
  for (const entry of next.audit.slice(t.audit.length))
    entry.revision = next.revision;
  next.schema = 2;
  next.modifiedAt = now();
  next.audit.push({
    id: id(),
    at: now(),
    revision: next.revision,
    action: "scan-approved",
    detail: {
      scanId,
      sourceId: scan.sourceId,
      formId: form.id,
      accepted,
      matches: applied,
    },
  });
  return next;
}
