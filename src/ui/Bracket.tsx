import { useEffect, useState } from "react";
import { Trophy, Check, ArrowLeftRight } from "lucide-react";
import type { Match, Phase } from "../domain/types";
import { PrintTeamSheet } from "./RegistrationSheets";
import {
  finalPlacements,
  outcome,
  validateScore,
  defaultRules,
  previousPhaseRanks,
  canSwapBracketTeams,
} from "../domain/engine";
import { useApp, Modal, Hint } from "./shared";
import { DocumentButtons } from "./PhaseView";
const W = 222,
  H = 80,
  GAP = 78;
export function bracketLayout(p: Phase) {
  const positions = new Map<string, { x: number; y: number }>();
  const first = p.matches.filter((m) => m.round === 0 && !m.bronze);
  first.forEach((m, i) => positions.set(m.id, { x: 24, y: 70 + i * 124 }));
  for (const m of p.matches.filter((m) => m.round > 0 && !m.bronze)) {
    const parents = m.refs!.map((r) => positions.get(r.id));
    const y = parents.reduce((s, q) => s + (q?.y || 70), 0) / parents.length;
    positions.set(m.id, { x: 24 + m.round * (W + GAP), y });
  }
  const final = p.matches.filter((m) => !m.bronze).at(-1)!;
  const bronze = p.matches.find((m) => m.bronze);
  if (bronze) {
    const pos = positions.get(final.id)!;
    positions.set(bronze.id, { x: pos.x, y: pos.y + 190 });
  }
  return {
    positions,
    width: Math.max(...[...positions.values()].map((q) => q.x)) + W + 35,
    height: Math.max(...[...positions.values()].map((q) => q.y)) + H + 40,
  };
}
export function Bracket({
  phase: p,
  onMatch,
  ranking,
}: {
  phase: Phase;
  onMatch: (id: string) => void;
  ranking: boolean;
}) {
  const { session, command, busy, notify } = useApp();
  const [editing, setEditing] = useState(false),
    [selected, setSelected] = useState<string | null>(null);
  const canSwap = canSwapBracketTeams(p),
    ranks = previousPhaseRanks(session.tournament, p);
  useEffect(() => {
    if (!canSwap) {
      setEditing(false);
      setSelected(null);
    }
  }, [canSwap]);
  const { positions, width, height } = bracketLayout(p);
  const name = (tid: string | null) =>
    tid ? p.teamNames[tid] : "À déterminer";
  const rankedName = (tid: string | null) =>
    `${name(tid)}${tid && ranks[tid] ? `, rang précédent ${ranks[tid]}` : ""}`;
  const swap = async (tid: string) => {
    if (!selected) {
      setSelected(tid);
      return;
    }
    if (selected === tid) {
      setSelected(null);
      return;
    }
    try {
      await command({
        type: "bracket-swap",
        phaseId: p.id,
        teamA: selected,
        teamB: tid,
      });
      setSelected(null);
      notify("Équipes échangées. Les feuilles sont à jour.");
    } catch {}
  };
  if (ranking) {
    const rows = finalPlacements(p);
    return (
      <div className="panel podium-panel">
        <h3>
          <Trophy size={21} />
          Classement final · {p.lane}
        </h3>
        {rows.length ? (
          <div className="final-ranking">
            {rows.map((r) => (
              <div key={r.teamId}>
                <span className={`podium-number p${r.place}`}>{r.place}</span>
                <strong>{name(r.teamId)}</strong>
                {r.place === 1 && <Trophy size={19} />}
                <PrintTeamSheet teamId={r.teamId} />
              </div>
            ))}
          </div>
        ) : (
          <Hint>
            Le classement final apparaîtra après la finale. Les places 3 et 4
            dépendent de la Petite finale.
          </Hint>
        )}
      </div>
    );
  }
  return (
    <div className="panel bracket-panel">
      <div className="bracket-intro">
        <div>
          <h3>Tableau à élimination directe</h3>
          <p>
            Cliquez sur une rencontre pour saisir le score, définir le terrain
            ou afficher sa feuille.
          </p>
        </div>
        <button
          disabled={busy || !canSwap}
          title="Échanges possibles avant le premier résultat de cette phase"
          className={editing ? "primary" : ""}
          aria-pressed={editing}
          onClick={() => {
            setEditing(!editing);
            setSelected(null);
          }}
        >
          <ArrowLeftRight size={16} />
          {editing ? "Terminer les échanges" : "Échanger des équipes"}
        </button>
      </div>
      {editing && canSwap && (
        <div className="bracket-swap-hint" role="status">
          {selected
            ? `Sélectionnez l’équipe à échanger avec ${name(selected)}, ou cliquez à nouveau pour annuler.`
            : "Sélectionnez deux équipes du premier tour pour les échanger."}
        </div>
      )}
      <div className="bracket-scroll">
        <div className="bracket-canvas" style={{ width, height }}>
          <svg
            width={width}
            height={height}
            className="bracket-lines"
            aria-hidden="true"
          >
            {p.matches.flatMap((m) =>
              m.refs
                ?.filter((r) => r.type === "winner" || r.type === "loser")
                .map((r, i) => {
                  const from = positions.get(r.id),
                    to = positions.get(m.id);
                  if (!from || !to) return null;
                  const sx = from.x + W,
                    sy = from.y + H / 2,
                    ex = to.x,
                    ey = to.y + H / 2 + (i === 0 ? -12 : 12);
                  const elbow = sx + (m.bronze ? 57 : 29 + i * 8);
                  return (
                    <path
                      key={`${m.id}-${i}`}
                      className={m.bronze ? "loser-line" : ""}
                      d={`M ${sx} ${sy} H ${elbow} V ${ey} H ${ex}`}
                    />
                  );
                }),
            )}
          </svg>
          {Array.from(
            new Set(p.matches.filter((m) => !m.bronze).map((m) => m.round)),
          ).map((round) => {
            const remaining =
              Math.max(...p.matches.map((m) => m.round)) - round;
            return (
              <div
                className="round-title"
                style={{ left: 24 + round * (W + GAP) }}
                key={round}
              >
                {remaining === 0
                  ? "Finale"
                  : remaining === 1
                    ? "Demi-finales"
                    : remaining === 2
                      ? "Quarts de finale"
                      : `Tour ${round + 1}`}
              </div>
            );
          })}
          {p.matches.map((m) => {
            const pos = positions.get(m.id)!;
            const placeholder = (i: number) => {
              const ref = m.refs?.[i];
              if (ref?.type === "bye") return "Exemption";
              if (ref?.type === "team") return p.teamNames[ref.id];
              return ref?.type === "loser"
                ? "Perdant de demi-finale"
                : "Vainqueur du tour précédent";
            };
            const teamLine = (tid: string | null, side: number) => (
              <>
                <span
                  className="bracket-team-name"
                  title={tid ? name(tid) : placeholder(side)}
                >
                  {tid ? name(tid) : placeholder(side)}
                </span>
                {tid && ranks[tid] && (
                  <span
                    className="bracket-rank"
                    title="Rang général dans la phase de groupes précédente"
                    aria-hidden="true"
                  >
                    #{ranks[tid]}
                  </span>
                )}
              </>
            );
            const lineClass = (tid: string | null) =>
              `bracket-team-line ${tid && outcome(m, "winner") === tid ? "bracket-winner" : ""}`;
            return (
              <div
                className="bracket-node-wrap"
                style={{ left: pos.x, top: pos.y, width: W, height: H }}
                key={m.id}
              >
                {m.bronze && <div className="bronze-title">Petite finale</div>}
                {editing && canSwap && m.round === 0 && !m.bronze ? (
                  <div
                    className={`bracket-card editing-card ${m.bye ? "bye" : ""}`}
                    aria-label={`Modifier le match ${m.order}`}
                  >
                    {([m.a, m.b] as const).map((tid, side) =>
                      tid ? (
                        <button
                          key={side}
                          className={`${lineClass(tid)} ${selected === tid ? "swap-selected" : ""}`}
                          disabled={busy}
                          aria-label={`Échanger ${rankedName(tid)}`}
                          aria-pressed={selected === tid}
                          onClick={() => void swap(tid)}
                        >
                          {teamLine(tid, side)}
                        </button>
                      ) : (
                        <span className={lineClass(tid)} key={side}>
                          {teamLine(tid, side)}
                        </span>
                      ),
                    )}
                  </div>
                ) : (
                  <button
                    className={`bracket-card ${m.score ? "completed" : ""} ${m.bye ? "bye" : ""}`}
                    aria-label={`Ouvrir ${m.bronze ? "Petite finale" : `match ${m.order}`} : ${rankedName(m.a)} contre ${rankedName(m.b)}`}
                    onClick={() => onMatch(m.id)}
                  >
                    <span className={lineClass(m.a)}>{teamLine(m.a, 0)}</span>
                    <span className={lineClass(m.b)}>{teamLine(m.b, 1)}</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="bracket-legend">
        <span>
          <i />
          Vainqueur
        </span>
        <span>
          <i className="dashed" />
          Perdant vers la Petite finale
        </span>
        <span>Les exemptions avancent automatiquement.</span>
      </div>
    </div>
  );
}
export function MatchPopup({
  phase: p,
  matchId,
  printer,
  onClose,
}: {
  phase: Phase;
  matchId: string;
  printer: string;
  onClose: () => void;
}) {
  const { session, command, busy, native, notify, confirm, dirty } = useApp();
  const m = p.matches.find((m) => m.id === matchId)!;
  const [a, setA] = useState(m.score?.[0].toString() ?? ""),
    [b, setB] = useState(m.score?.[1].toString() ?? ""),
    [court, setCourt] = useState(m.court),
    [referee, setReferee] = useState(
      p.kind === "knockout" && m.referee === "Arbitre externe à désigner"
        ? ""
        : p.teamNames[m.referee] || m.referee,
    ),
    [error, setError] = useState(""),
    [changed, setChanged] = useState(false),
    [saving, setSaving] = useState(false);
  const doc = session.tournament.documents.find((d) => d.matchId === m.id);
  const playable = !!(m.a && m.b && !m.bye);
  const change = () => {
    setChanged(true);
    dirty("match-popup", true);
  };
  useEffect(() => () => dirty("match-popup", false), []);
  async function close() {
    if (
      !changed ||
      (await confirm(
        "Fermer sans enregistrer ?",
        "Les modifications de cette rencontre sont encore en cours de saisie.",
        "Abandonner",
      ))
    )
      onClose();
  }
  async function save() {
    setSaving(true);
    try {
      let score: [number, number] | undefined;
      if (a !== "" || b !== "") {
        if (a === "" || b === "") throw new Error("Complétez les deux scores.");
        score = [Number(a), Number(b)];
        validateScore(score, m.target, defaultRules);
      }
      if (score && m.score && score.some((x, i) => x !== m.score![i])) {
        const impact = await native<{
          phases: string[];
          matches: number;
          splits: number;
        }>("impact", {
          packageId: session.tournament.id,
          phaseId: p.id,
          matchId: m.id,
        });
        const description = `Ancien score : ${m.score.join(" – ")}. Nouveau score : ${score.join(" – ")}. ${impact.phases.length ? `Les phases suivantes seront retirées du parcours et archivées : ${impact.phases.join(", ")}. ` : ""}${impact.splits ? "La répartition Principale / Consolante sera à refaire. " : ""}${impact.matches ? `${impact.matches} résultat(s) dépendant(s) seront annulés. ` : ""}L’ancienne situation restera dans l’historique. Les feuilles des rencontres dépendantes seront actualisées automatiquement.`;
        if (
          !(await confirm(
            "Confirmer la correction",
            description,
            "Corriger et appliquer les conséquences",
          ))
        )
          return;
      }
      if (
        court !== m.court ||
        referee !== (p.teamNames[m.referee] || m.referee)
      )
        await command({
          type: "match-details",
          phaseId: p.id,
          matchId: m.id,
          court,
          referee,
        });
      if (score)
        await command({
          type: "score",
          phaseId: p.id,
          matchId: m.id,
          score,
          correction: !!m.score,
          acknowledge: true,
        });
      setChanged(false);
      dirty("match-popup", false);
      notify("Rencontre mise à jour.");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      title={
        m.bronze
          ? "Petite finale"
          : `Rencontre ${m.order}${m.score ? " · Correction" : ""}`
      }
      onClose={() => void close()}
    >
      <div className="modal-body">
        <div className="match-versus">
          <strong>{m.a ? p.teamNames[m.a] : "À déterminer"}</strong>
          <span>contre</span>
          <strong>
            {m.b ? p.teamNames[m.b] : m.bye ? "Exemption" : "À déterminer"}
          </strong>
        </div>
        <div className="match-state">
          <span className="small-chip">
            {m.bye
              ? "Exemption"
              : m.score
                ? "Jouée"
                : playable
                  ? "Prête à jouer"
                  : "En attente des tours précédents"}
          </span>
          <span>
            Victoire en {m.target} points · écart {2}
          </span>
        </div>
        {m.score && (
          <Hint>
            Vainqueur : {p.teamNames[outcome(m, "winner")!]}. Le score précédent
            sera conservé si vous le corrigez.
          </Hint>
        )}
        <div className="popup-scores">
          <label>
            Score 1
            <input
              type="number"
              min={0}
              max={999}
              value={a}
              disabled={!playable}
              onChange={(e) => {
                setA(e.target.value);
                change();
              }}
            />
          </label>
          <span>–</span>
          <label>
            Score 2
            <input
              type="number"
              min={0}
              max={999}
              value={b}
              disabled={!playable}
              onChange={(e) => {
                setB(e.target.value);
                change();
              }}
            />
          </label>
        </div>
        <div className="form-row">
          <label>
            Terrain
            {m.groupId ? (
              <select
                aria-label="Terrain"
                value={court}
                onChange={(e) => {
                  setCourt(e.target.value);
                  change();
                }}
              >
                {p.groups
                  .find((g) => g.id === m.groupId)!
                  .courts.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
              </select>
            ) : (
              <input
                value={court}
                maxLength={40}
                onChange={(e) => {
                  setCourt(e.target.value);
                  change();
                }}
              />
            )}
          </label>
          <label>
            Arbitre
            <input
              value={referee}
              maxLength={120}
              onChange={(e) => {
                setReferee(e.target.value);
                change();
              }}
            />
          </label>
        </div>
        <div className="sheet-section">
          <DocumentButtons documentId={doc?.id} printer={printer} />
        </div>
        {error && <Hint error>{error}</Hint>}
      </div>
      <footer className="modal-footer">
        <button onClick={() => void close()}>Fermer</button>
        <button
          className="primary"
          disabled={busy || saving || !changed}
          onClick={() => void save()}
        >
          <Check size={17} />
          {m.score ? "Appliquer la correction" : "Enregistrer la rencontre"}
        </button>
      </footer>
    </Modal>
  );
}
