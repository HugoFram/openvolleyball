import { useEffect, useRef, useState } from "react";
import {
  Check,
  ArrowLeftRight,
  FileText,
  Printer,
  Eye,
  WandSparkles,
  Pencil,
  Trash2,
  Layers,
} from "lucide-react";
import type { Group, Match, Phase, Tournament } from "../domain/types";
import {
  standings,
  overallStandings,
  validateScore,
  defaultRules,
} from "../domain/engine";
import { useApp, Hint, Status, phaseName } from "./shared";
import { Bracket, MatchPopup } from "./Bracket";
export function PhaseView({ phase: p }: { phase: Phase }) {
  const { session, command, native, busy, confirm, notify, guard } = useApp();
  const [tab, setTab] = useState("matches"),
    [printer, setPrinter] = useState(localStorage.getItem("printer") || ""),
    [printers, setPrinters] = useState<{ name: string; displayName: string }[]>(
      [],
    ),
    [popup, setPopup] = useState<string | null>(null);
  useEffect(() => {
    window.volley
      .call<{ name: string; displayName: string }[]>("printers")
      .then((r) => {
        if (r.ok) setPrinters(r.value || []);
      });
  }, []);
  const docs = session.tournament.documents.filter((d) => d.phaseId === p.id);
  return (
    <section className="phase-detail">
      <div className="toolbar">
        <div>
          <div className="eyebrow">
            {p.lane.toLocaleUpperCase()} · {p.category.toLocaleUpperCase()}
          </div>
          <h2 className="phase-title">
            {phaseName(p)}
            <Status status={p.status} />
          </h2>
        </div>
        {p.status !== "Préparation" && (
          <div className="actions">
            <span className="target-chip">Victoire en {p.target} points</span>
            <button
              disabled={busy}
              onClick={() =>
                void guard(async () => {
                  await native("print-phase", {
                    packageId: session.tournament.id,
                    phaseId: p.id,
                    printer,
                  });
                })
              }
            >
              <Printer size={16} />
              Imprimer toutes les feuilles
            </button>
            <button
              disabled={busy || p.status === "Terminée"}
              onClick={async () => {
                if (
                  await confirm(
                    "Générer des scores aléatoires ?",
                    "Seuls les matchs non joués dont les participants sont connus seront remplis. Les résultats existants sont conservés.",
                    "Générer les scores",
                  )
                )
                  void command({ type: "random", phaseId: p.id })
                    .then(() =>
                      notify("Les scores éligibles ont été enregistrés."),
                    )
                    .catch(() => {});
              }}
            >
              <WandSparkles size={16} />
              Générer des scores aléatoires
            </button>
          </div>
        )}
      </div>
      {p.status === "Préparation" ? (
        <Draft phase={p} />
      ) : (
        <>
          <div className="detail-tabs">
            <div>
              {(p.kind === "knockout"
                ? [
                    ["matches", "Tableau"],
                    ["ranking", "Classement final"],
                  ]
                : [
                    ["matches", "Rencontres et scores"],
                    ["groups", "Groupes et feuilles"],
                    ["ranking", "Classements"],
                  ]
              ).map(([key, label]) => (
                <button
                  key={key}
                  className={tab === key ? "active" : ""}
                  onClick={() => void guard(() => setTab(key))}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="printer-label">
              <Printer size={16} />
              Imprimante
              <select
                aria-label="Imprimante"
                value={printer}
                onChange={(e) => {
                  setPrinter(e.target.value);
                  localStorage.setItem("printer", e.target.value);
                }}
              >
                <option value="">Choix système</option>
                {printers.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.displayName || p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {p.kind === "knockout" ? (
            <Bracket phase={p} onMatch={setPopup} ranking={tab === "ranking"} />
          ) : tab === "ranking" ? (
            <>
              <Standings phase={p} general />
              <div className="standings-grid">
                {p.groups.map((g) => (
                  <Standings key={g.id} phase={p} group={g} />
                ))}
              </div>
            </>
          ) : tab === "groups" ? (
            <div className="group-grid">
              {p.groups.map((g) => (
                <article className="panel group-card" key={g.id}>
                  <GroupHeader phase={p} group={g} />
                  <ul className="group-teams">
                    {g.teamIds.map((id) => (
                      <li key={id}>
                        <span>{p.teamNames[id]}</span>
                        <span className="level-badge">
                          {teamMetric(p, id, session.tournament)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <DocumentButtons
                    documentId={docs.find((d) => d.groupId === g.id)?.id}
                    printer={printer}
                  />
                </article>
              ))}
            </div>
          ) : (
            <div className="match-groups">
              {p.groups.map((g) => (
                <section className="panel score-panel" key={g.id}>
                  <div className="score-heading">
                    <GroupHeader phase={p} group={g} />
                    <DocumentButtons
                      documentId={docs.find((d) => d.groupId === g.id)?.id}
                      printer={printer}
                    />
                  </div>
                  <div className="table-wrap">
                    <table className="score-table">
                      <thead>
                        <tr>
                          <th>Ordre</th>
                          <th>Terrain / Arbitre</th>
                          <th>Équipe 1</th>
                          <th className="score-th">Score 1</th>
                          <th className="score-th">Score 2</th>
                          <th>Équipe 2</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {p.matches
                          .filter((m) => m.groupId === g.id)
                          .map((m) => (
                            <ScoreRow
                              key={m.id}
                              match={m}
                              phase={p}
                              onCorrect={() => setPopup(m.id)}
                            />
                          ))}
                      </tbody>
                    </table>
                  </div>
                  <Standings phase={p} group={g} compact />
                </section>
              ))}
            </div>
          )}
          {popup && (
            <MatchPopup
              phase={p}
              matchId={popup}
              printer={printer}
              onClose={() => setPopup(null)}
            />
          )}
        </>
      )}
    </section>
  );
}
function GroupHeader({ phase: p, group: g }: { phase: Phase; group: Group }) {
  return (
    <div className="group-head">
      <div>
        <h3>{g.name}</h3>
        <span>
          {p.sourceId ? "Classement précédent" : "Niveau moyen"}{" "}
          {!p.sourceId &&
            (
              g.teamIds.reduce((s, x) => s + p.levels[x], 0) / g.teamIds.length
            ).toFixed(2)}
        </span>
      </div>
      <span className="small-chip">Terrain : {g.courts.join(" / ")}</span>
    </div>
  );
}
function teamMetric(p: Phase, teamId: string, t: Tournament) {
  if (!p.sourceId) return p.levels[teamId].toFixed(2);
  const source = t.phases.find((x) => x.id === p.sourceId);
  return `#${p.previousRanks?.[teamId] || (source ? overallStandings(source).find((r) => r.teamId === teamId)?.overallPlace : "—")}`;
}
export function DocumentButtons({
  documentId,
  printer,
}: {
  documentId?: string;
  printer: string;
}) {
  const { native, notify } = useApp();
  const action = async (method: string) => {
    if (!documentId) return;
    try {
      await native(method, { id: documentId, printer });
    } catch (e) {
      notify((e as Error).message, true);
    }
  };
  return (
    <div className="document-actions">
      {documentId ? (
        <>
          <button onClick={() => void action("view-document")}>
            <Eye size={15} />
            Afficher
          </button>
          <button onClick={() => void action("print-document")}>
            <Printer size={15} />
            Imprimer
          </button>
        </>
      ) : (
        <Hint error>Feuille manquante : fermez puis rouvrez le tournoi.</Hint>
      )}
    </div>
  );
}
function Draft({ phase: p }: { phase: Phase }) {
  const { session, command, busy, dirty, confirm, notify } = useApp();
  const legacyCourts = p.groups.some(
    (g) => g.teamIds.length !== 5 && g.courts.length > 1,
  );
  const [groups, setGroups] = useState<Group[]>(
      p.groups.map((g) => ({
        ...structuredClone(g),
        courts: g.teamIds.length === 5 ? [...g.courts] : [g.courts[0]],
      })),
    ),
    [selected, setSelected] = useState<string | null>(null),
    [target, setTarget] = useState<21 | 25>(p.target),
    [changed, setChanged] = useState(legacyCourts),
    [error, setError] = useState("");
  useEffect(() => {
    if (legacyCourts) dirty("draft", true);
    return () => dirty("draft", false);
  }, []);
  const update = (next: Group[]) => {
    setGroups(next);
    setChanged(true);
    dirty("draft", true);
  };
  const save = async () => {
    try {
      await command({ type: "draft-update", phaseId: p.id, groups, target });
      setChanged(false);
      dirty("draft", false);
      setError("");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  };
  const swap = (teamId: string) => {
    if (!selected) {
      setSelected(teamId);
      return;
    }
    if (selected === teamId) {
      setSelected(null);
      return;
    }
    const a = groups.find((g) => g.teamIds.includes(selected))!,
      b = groups.find((g) => g.teamIds.includes(teamId))!;
    if (a.id !== b.id)
      update(
        groups.map((g) => ({
          ...g,
          teamIds: g.teamIds.map((x) =>
            x === selected ? teamId : x === teamId ? selected : x,
          ),
        })),
      );
    setSelected(null);
  };
  return (
    <>
      <div className="draft-banner">
        <Layers size={22} />
        <div>
          <strong>Répartition des groupes</strong>
          <p>
            Cliquez sur deux équipes de groupes différents pour les échanger.
            Les terrains acceptent des noms complets.
          </p>
        </div>
        <span className="small-chip">
          {changed ? "Modifications en cours" : "Brouillon enregistré"}
        </span>
      </div>
      <div className="draft-toolbar">
        <div className="target-row">
          <span>Victoire en</span>
          <select
            aria-label="Victoire en points du brouillon"
            value={target}
            onChange={(e) => {
              setTarget(Number(e.target.value) as 21 | 25);
              setChanged(true);
              dirty("draft", true);
            }}
          >
            <option value={21}>21</option>
            <option value={25}>25</option>
          </select>
          <span>points</span>
        </div>
        <div className="actions">
          {changed && (
            <button disabled={busy} onClick={() => void save()}>
              Enregistrer le brouillon
            </button>
          )}
          <button
            className="danger subtle"
            disabled={busy}
            onClick={async () => {
              if (
                await confirm(
                  "Supprimer ce brouillon ?",
                  "Les phases confirmées et leurs résultats seront conservés. Vous pourrez générer une nouvelle répartition.",
                  "Supprimer le brouillon",
                )
              ) {
                await command({ type: "draft-delete", phaseId: p.id });
                dirty("draft", false);
              }
            }}
          >
            <Trash2 size={15} />
            Supprimer / régénérer
          </button>
        </div>
      </div>
      {selected && (
        <Hint>
          Choisissez l’équipe à échanger avec {p.teamNames[selected]}, ou
          cliquez à nouveau pour annuler.
        </Hint>
      )}
      <div className="group-grid">
        {groups.map((g, i) => (
          <article className="panel group-card draft-card" key={g.id}>
            <div className="draft-group-heading">
              <div>
                <h3>{g.name}</h3>
                <small>
                  {p.sourceId ? "Classement précédent" : "Niveau moyen"}{" "}
                  {!p.sourceId &&
                    (
                      g.teamIds.reduce((s, x) => s + p.levels[x], 0) /
                      g.teamIds.length
                    ).toFixed(2)}
                </small>
              </div>
              {g.teamIds.length === 5 && (
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={g.courts.length === 2}
                    onChange={(e) =>
                      update(
                        groups.map((x) =>
                          x.id === g.id
                            ? {
                                ...x,
                                courts: e.target.checked
                                  ? [x.courts[0], `${x.courts[0]}B`]
                                  : [x.courts[0]],
                              }
                            : x,
                        ),
                      )
                    }
                  />
                  Deux terrains
                </label>
              )}
            </div>
            <div className="court-fields">
              <span>Terrain :</span>
              {g.courts.map((c, j) => (
                <input
                  key={j}
                  aria-label={`${g.name} terrain ${j + 1}`}
                  value={c}
                  maxLength={40}
                  onChange={(e) =>
                    update(
                      groups.map((x) =>
                        x.id === g.id
                          ? {
                              ...x,
                              courts: x.courts.map((court, k) =>
                                k === j ? e.target.value : court,
                              ),
                            }
                          : x,
                      ),
                    )
                  }
                />
              ))}
            </div>
            <div className="draft-team-list">
              {g.teamIds.map((tid, j) => (
                <button
                  key={tid}
                  className={selected === tid ? "swap-selected" : ""}
                  onClick={() => swap(tid)}
                >
                  <span className="team-number">
                    {String(j + 1).padStart(2, "0")}
                  </span>
                  <span>{p.teamNames[tid]}</span>
                  <span className="level-badge">
                    {teamMetric(p, tid, session.tournament)}
                  </span>
                  <ArrowLeftRight size={14} />
                </button>
              ))}
            </div>
            <small className="muted">
              {(g.teamIds.length * (g.teamIds.length - 1)) / 2} rencontres ·{" "}
              {g.courts.length} terrain(s)
            </small>
          </article>
        ))}
      </div>
      {error && <Hint error>{error}</Hint>}
      <div className="page-bottom">
        <button
          className="primary"
          disabled={busy}
          onClick={async () => {
            if (await save()) {
              await command({ type: "confirm", phaseId: p.id })
                .then(() =>
                  notify(
                    "Phase confirmée. Toutes les feuilles PDF sont prêtes.",
                  ),
                )
                .catch(() => {});
            }
          }}
        >
          <Check size={18} />
          Confirmer les groupes
        </button>
      </div>
    </>
  );
}
function ScoreRow({
  match: m,
  phase: p,
  onCorrect,
}: {
  match: Match;
  phase: Phase;
  onCorrect: () => void;
}) {
  const { command, dirty } = useApp();
  const [a, setA] = useState(m.score?.[0].toString() || ""),
    [b, setB] = useState(m.score?.[1].toString() || ""),
    [error, setError] = useState("");
  const saving = useRef(false);
  useEffect(() => {
    setA(m.score?.[0].toString() ?? "");
    setB(m.score?.[1].toString() ?? "");
    setError("");
    dirty(m.id, false);
  }, [m.score?.[0], m.score?.[1]]);
  useEffect(() => () => dirty(m.id, false), []);
  async function blur() {
    if (m.score || saving.current) return;
    if (a === "" && b === "") {
      dirty(m.id, false);
      setError("");
      return;
    }
    if (a === "" || b === "") {
      setError("Complétez les deux scores.");
      return;
    }
    const score: [number, number] = [Number(a), Number(b)];
    try {
      validateScore(score, m.target, defaultRules);
      saving.current = true;
      await command({ type: "score", phaseId: p.id, matchId: m.id, score });
      dirty(m.id, false);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      saving.current = false;
    }
  }
  return (
    <tr className={error ? "invalid-row" : m.score ? "played-row" : ""}>
      <td className="match-order">
        {String(m.order).padStart(2, "0")}
        <small>Tour {m.slot + 1}</small>
      </td>
      <td>
        <strong className="court-name">{m.court}</strong>
        <small>{p.teamNames[m.referee] || m.referee}</small>
      </td>
      <td className={m.score && m.score[0] > m.score[1] ? "winner-name" : ""}>
        {p.teamNames[m.a!]}
      </td>
      <td className="score-cell">
        <input
          aria-label={`${p.teamNames[m.a!]} score match ${m.order}`}
          inputMode="numeric"
          type="number"
          min={0}
          max={999}
          readOnly={!!m.score}
          value={a}
          onChange={(e) => {
            setA(e.target.value);
            dirty(m.id, true);
          }}
          onBlur={() => void blur()}
        />
        {error && (
          <span className="row-error" role="alert">
            {error}
          </span>
        )}
      </td>
      <td className="score-cell">
        <input
          aria-label={`${p.teamNames[m.b!]} score match ${m.order}`}
          inputMode="numeric"
          type="number"
          min={0}
          max={999}
          readOnly={!!m.score}
          value={b}
          onChange={(e) => {
            setB(e.target.value);
            dirty(m.id, true);
          }}
          onBlur={() => void blur()}
        />
      </td>
      <td className={m.score && m.score[1] > m.score[0] ? "winner-name" : ""}>
        {p.teamNames[m.b!]}
      </td>
      <td>
        {m.score ? (
          <button
            className="icon-button"
            aria-label={`Corriger le match ${m.order}`}
            title="Correction explicite"
            onClick={onCorrect}
          >
            <Pencil size={15} />
          </button>
        ) : (
          <button
            className="icon-button"
            aria-label={`Détails du match ${m.order}`}
            title="Terrain et arbitre"
            onClick={onCorrect}
          >
            <Pencil size={15} />
          </button>
        )}
      </td>
    </tr>
  );
}
export function Standings({
  phase: p,
  group: g,
  compact = false,
  general = false,
}: {
  phase: Phase;
  group?: Group;
  compact?: boolean;
  general?: boolean;
}) {
  const rows = general ? overallStandings(p) : standings(p, g!);
  return (
    <div className={compact ? "standings compact" : "panel standings"}>
      {!compact && <h3>{general ? "Classement général" : g!.name}</h3>}
      <div className="ranking-label">
        VICTOIRES / MATCHS JOUÉS, PUIS DIFFÉRENCE / MATCHS JOUÉS
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Rang</th>
              <th>Équipe</th>
              {general && <th>Groupe</th>}
              <th title="Matchs joués">MJ</th>
              <th>V</th>
              <th>D</th>
              <th>Pts</th>
              <th>Pour</th>
              <th>Contre</th>
              <th>Diff.</th>
              <th>V / MJ</th>
              <th>Diff. / MJ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.teamId}>
                <td>
                  <span className={`rank ${i === 0 ? "first" : ""}`}>
                    {general ? r.overallPlace : r.place}
                  </span>
                </td>
                <td>
                  <strong>{p.teamNames[r.teamId]}</strong>
                </td>
                {general && (
                  <td>{p.groups.find((g) => g.id === r.groupId)?.name}</td>
                )}
                <td>{r.played}</td>
                <td>{r.wins}</td>
                <td>{r.losses}</td>
                <td>
                  <strong>{r.points}</strong>
                </td>
                <td>{r.scored}</td>
                <td>{r.conceded}</td>
                <td className={r.diff > 0 ? "positive" : ""}>
                  {r.diff > 0 ? "+" : ""}
                  {r.diff}
                </td>
                <td>{(r.wins / Math.max(1, r.played)).toFixed(3)}</td>
                <td>{(r.diff / Math.max(1, r.played)).toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
