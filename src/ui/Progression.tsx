import { useState, useEffect } from "react";
import {
  ArrowRight,
  Plus,
  GitFork,
  Layers,
  Trophy,
  Check,
  Users,
  Flag,
} from "lucide-react";
import type { Category, Lane, Phase, Session } from "../domain/types";
import {
  laneCandidates,
  latest,
  rankingPlan,
  structures,
} from "../domain/engine";
import { useApp, Status, Modal, Hint, phaseName, Empty } from "./shared";
import { PhaseView } from "./PhaseView";

export function Progression({
  category,
  onRegister,
  onRules,
}: {
  category: Category;
  onRegister: () => void;
  onRules: () => void;
}) {
  const { session, command, busy, guard } = useApp(),
    t = session.tournament;
  const phases = t.phases.filter((p) => p.category === category),
    initial = phases.find((p) => p.lane === "Commun");
  const split = t.splits.find((s) => s.category === category),
    teams = t.teams.filter((x) => x.category === category && !x.withdrawn);
  const [selected, setSelected] = useState<string | null>(initial?.id || null),
    [creator, setCreator] = useState<Lane | null>(null),
    [qualification, setQualification] = useState<{
      source: Phase;
      lane: Lane;
      purpose: "split" | "seeds";
    } | null>(null);
  const p = phases.find((x) => x.id === selected);
  const ordered = (lane: Lane) => {
    const out: Phase[] = [];
    let next = phases.find(
      (p) =>
        p.lane === lane &&
        !phases.some((q) => q.lane === lane && q.id === p.sourceId),
    );
    while (next) {
      out.push(next);
      next = phases.find((p) => p.lane === lane && p.sourceId === next!.id);
      if (out.length > phases.length) break;
    }
    return out;
  };
  const played = phases.flatMap((x) => x.matches).filter((x) => x.score).length,
    total = phases.flatMap((x) => x.matches).filter((m) => !m.bye).length;
  function choose(pid: string) {
    void guard(() => setSelected(pid));
  }
  const node = (phase: Phase) => (
    <button
      key={phase.id}
      className={`phase-node ${selected === phase.id ? "selected" : ""}`}
      onClick={() => choose(phase.id)}
    >
      <div className="node-top">
        <span className="node-icon">
          {phase.kind === "knockout" ? (
            <Trophy size={19} />
          ) : (
            <Layers size={19} />
          )}
        </span>
        <Status status={phase.status} />
      </div>
      <strong>{phaseName(phase)}</strong>
      <small>
        {phase.teamIds.length} équipes ·{" "}
        {phase.matches.filter((m) => m.score).length}/
        {phase.matches.filter((m) => !m.bye).length} matchs
      </small>
      <span className="node-link">
        {phase.kind === "knockout"
          ? "Ouvrir le tableau"
          : phase.status === "Préparation"
            ? "Préparer les groupes"
            : "Voir les rencontres"}
        <ArrowRight size={14} />
      </span>
    </button>
  );
  const options = (lane: Lane) => {
    const last = latest(t, category, lane);
    if (last?.kind === "knockout") return null;
    let error = "",
      source: Phase | null = null,
      ids: string[] = [];
    try {
      ({ source, ids } = laneCandidates(t, category, lane));
    } catch (e) {
      error = (e as Error).message;
    }
    return (
      <div className="next-options">
        <span>LA SUITE DU PARCOURS</span>
        <button
          disabled={busy || !!error || ids.length < 3}
          onClick={() => setCreator(lane)}
        >
          <Plus size={15} />
          Groupes
        </button>
        <button
          disabled={busy || !!error || ids.length < 2}
          onClick={() =>
            source && setQualification({ source, lane, purpose: "seeds" })
          }
        >
          <Trophy size={15} />
          Phase finale
        </button>
        {error ? (
          <small>{error}</small>
        ) : ids.length < 3 ? (
          <small>{ids.length} équipe(s) : finale à partir de 2.</small>
        ) : (
          <small>{ids.length} équipes disponibles</small>
        )}
      </div>
    );
  };
  return (
    <>
      <div className="stats-row">
        <div className="stat">
          <span>ÉQUIPES EN COMPÉTITION</span>
          <strong>
            {teams.length}
            <small> / {category}</small>
          </strong>
        </div>
        <div className="stat">
          <span>RENCONTRES JOUÉES</span>
          <strong>
            {played}
            <small> / {total}</small>
          </strong>
          <div className="progress-track">
            <i style={{ width: `${(played / Math.max(1, total)) * 100}%` }} />
          </div>
        </div>
        <div className="stat">
          <span>PHASES TERMINÉES</span>
          <strong>
            {phases.filter((x) => x.status === "Terminée").length}
            <small> / {phases.length}</small>
          </strong>
        </div>
      </div>
      <section className="panel progression-panel">
        <div className="section-title">
          <div>
            <h2>
              <GitFork size={20} />
              Progression
            </h2>
            <p>Les résultats restent accessibles à chaque étape.</p>
          </div>
          <span className="small-chip">{category}</span>
        </div>
        {!initial ? (
          <div className="initial-empty">
            <div className="step-orb">1</div>
            <h3>Tout commence par les groupes initiaux</h3>
            <p>
              {!t.rules.confirmed
                ? "Confirmez le règlement, puis répartissez vos équipes."
                : `${teams.length} équipes prêtes à entrer en jeu.`}
            </p>
            <div className="actions">
              {!t.rules.confirmed ? (
                <button className="primary" onClick={onRules}>
                  Confirmer le règlement
                  <ArrowRight size={16} />
                </button>
              ) : teams.length < 3 ? (
                <button className="primary" onClick={onRegister}>
                  <Users size={17} />
                  Inscrire des équipes
                </button>
              ) : (
                <button
                  className="primary"
                  onClick={() => setCreator("Commun")}
                >
                  <Plus size={17} />
                  Préparer les groupes initiaux
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="progression-scroll">
            <div className={`progression-map ${split ? "branched" : ""}`}>
              <div className="common-node">
                <span className="lane-label">PHASE COMMUNE</span>
                {node(initial)}
              </div>
              {split ? (
                <>
                  <div className="fork-lines">
                    <i />
                    <i />
                  </div>
                  <div className="lanes">
                    {(["Principale", "Consolante"] as Lane[]).map((lane) => (
                      <div className={`lane ${lane.toLowerCase()}`} key={lane}>
                        <div className="lane-label">
                          <span className="dot" />
                          {lane.toLocaleUpperCase()}
                          <small>
                            {
                              (lane === "Principale"
                                ? split.principale
                                : split.consolante
                              ).length
                            }{" "}
                            équipes
                          </small>
                        </div>
                        <div className="lane-nodes">
                          {ordered(lane).map((p, i) => (
                            <div className="connected-node" key={p.id}>
                              {i > 0 && <span className="node-connector" />}
                              {node(p)}
                            </div>
                          ))}
                          {options(lane)}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="split-prompt">
                  <ArrowRight size={24} />
                  <div>
                    <h3>Deux parcours, un même tournoi</h3>
                    <p>
                      {initial.status === "Terminée"
                        ? "Les groupes sont terminés. Répartissez maintenant les équipes."
                        : `Terminez les ${initial.matches.filter((m) => !m.score).length} matchs restants pour ouvrir les deux branches.`}
                    </p>
                    <button
                      className="primary"
                      disabled={initial.status !== "Terminée" || busy}
                      onClick={() =>
                        setQualification({
                          source: initial,
                          lane: "Commun",
                          purpose: "split",
                        })
                      }
                    >
                      <GitFork size={17} />
                      Créer Principale / Consolante
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
      {p ? (
        <PhaseView key={p.id} phase={p} />
      ) : initial ? (
        <Empty title="Choisissez une étape">
          Cliquez sur une phase pour consulter ses groupes, ses scores ou son
          tableau.
        </Empty>
      ) : null}
      {creator && (
        <GroupCreator
          category={category}
          lane={creator}
          onClose={() => setCreator(null)}
          onCreated={(pid) => {
            setSelected(pid);
            setCreator(null);
          }}
        />
      )}
      {qualification && (
        <Qualification
          source={qualification.source}
          lane={qualification.lane}
          purpose={qualification.purpose}
          onClose={() => setQualification(null)}
          onCreated={(pid) => {
            setSelected(pid);
            setQualification(null);
          }}
        />
      )}
    </>
  );
}
function GroupCreator({
  category,
  lane,
  onClose,
  onCreated,
}: {
  category: Category;
  lane: Lane;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { session, command, busy } = useApp(),
    t = session.tournament;
  // Keep the preparation context stable while its successful commit changes
  // the live progression, until the dialog closes.
  const [eligible] = useState(() => laneCandidates(t, category, lane));
  const [preferred, setPreferred] = useState(t.preferredSize),
    [target, setTarget] = useState<21 | 25>(21),
    [selected, setSelected] = useState(""),
    [error, setError] = useState("");
  const options = structures(eligible.ids.length, preferred);
  useEffect(() => {
    setSelected(structures(eligible.ids.length, preferred)[0]?.join("+") || "");
  }, [preferred, eligible.ids.length]);
  return (
    <Modal
      title={
        lane === "Commun"
          ? "Préparer les groupes initiaux"
          : `${lane} · Groupes ${eligible.number}`
      }
      onClose={onClose}
    >
      <div className="modal-body">
        <Hint>
          {eligible.ids.length} équipes · {lane} · Les groupes seront
          enregistrés en brouillon avant confirmation.
        </Hint>
        <div className="form-row">
          <label>
            Équipes par groupe
            <select
              aria-label="Équipes par groupe"
              value={preferred}
              onChange={(e) => setPreferred(Number(e.target.value))}
            >
              {[3, 4, 5].map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
          <label>
            Structure des groupes
            <select
              aria-label="Structure des groupes"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {options.map((s, i) => (
                <option value={s.join("+")} key={s.join("+")}>
                  {s.join(" + ")} · {s.length} groupes
                  {i === 0 ? " · recommandé" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="target-row">
          <span>Victoire en</span>
          <select
            aria-label="Cible de points"
            value={target}
            onChange={(e) => setTarget(Number(e.target.value) as 21 | 25)}
          >
            <option value={21}>21</option>
            <option value={25}>25</option>
          </select>
          <span>points</span>
        </div>
        {!options.length && (
          <Hint error>
            Aucune structure de groupes de 3, 4 ou 5 ne convient à{" "}
            {eligible.ids.length} équipes.
          </Hint>
        )}
        {error && <Hint error>{error}</Hint>}
      </div>
      <footer className="modal-footer">
        <button onClick={onClose}>Annuler</button>
        <button
          className="primary"
          disabled={busy || !selected}
          onClick={async () => {
            try {
              await command({
                type: "draft",
                category,
                lane,
                structure: selected.split("+").map(Number),
                target,
                preferredSize: preferred,
              });
              const r = await window.volley.call<Session>("session");
              const p = r.value?.tournament.phases.find(
                (p) =>
                  p.lane === lane &&
                  p.category === category &&
                  p.status === "Préparation",
              );
              if (p) onCreated(p.id);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <Layers size={17} />
          Générer les groupes
        </button>
      </footer>
    </Modal>
  );
}
function Qualification({
  source,
  lane,
  purpose,
  onClose,
  onCreated,
}: {
  source: Phase;
  lane: Lane;
  purpose: "split" | "seeds";
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { session, command, busy } = useApp(),
    t = session.tournament;
  const [candidates] = useState(() =>
    purpose === "seeds"
      ? laneCandidates(t, source.category, lane).ids
      : source.teamIds,
  );
  const available = candidates.filter(
    (x) => !t.teams.find((z) => z.id === x)?.withdrawn,
  ).length;
  const [count, setCount] = useState(
      purpose === "split"
        ? Math.max(2, Math.floor(available / 2))
        : Math.min(64, 2 ** Math.floor(Math.log2(available))),
    ),
    [decisions, setDecisions] = useState<Record<string, string[]>>({}),
    [error, setError] = useState(""),
    [earlyTarget, setEarly] = useState<21 | 25>(21),
    [finalTarget, setFinal] = useState<21 | 25>(25),
    [bronze, setBronze] = useState(t.rules.bronze);
  const plan = rankingPlan(t, source, count, purpose, candidates),
    validCount =
      Number.isInteger(count) &&
      count >= 2 &&
      count <= (purpose === "split" ? available - 2 : Math.min(available, 64));
  const unresolved = plan.ties.some((tie) => {
    const order = decisions[tie.key] || [];
    return (
      order.length !== tie.rows.length ||
      order.some((x) => !x) ||
      new Set(order).size !== tie.rows.length
    );
  });
  return (
    <Modal
      title={
        purpose === "split"
          ? "Créer Principale / Consolante"
          : `${lane} · Créer la phase finale`
      }
      onClose={onClose}
      wide
    >
      <div className="modal-body">
        <div className="qualification-summary">
          <label>
            {purpose === "split"
              ? "Nombre en Principale"
              : "Participants à la phase finale"}
            <input
              type="number"
              min={2}
              max={
                purpose === "split" ? available - 2 : Math.min(available, 64)
              }
              value={count || ""}
              onChange={(e) => {
                setCount(Number(e.target.value));
                setDecisions({});
              }}
            />
          </label>
          <div>
            <strong>
              {purpose === "split"
                ? `${available - count} en Consolante`
                : `Tableau de ${2 ** Math.ceil(Math.log2(count || 2))}`}
            </strong>
            <p>
              {purpose === "split"
                ? "Chaque équipe sera affectée à une seule branche."
                : `${2 ** Math.ceil(Math.log2(count || 2)) - count} exemption(s) · têtes de série protégées`}
            </p>
          </div>
        </div>
        <Hint>
          Source : {phaseName(source)} · {source.lane}.{" "}
          {source.rules.crossGroup === "place-first"
            ? "Rang de groupe, puis points de classement par match et différence par match."
            : "Points de classement par match, puis différence par match."}{" "}
          Victoire : 2 pts ; défaite : 1 pt.
        </Hint>
        {purpose === "seeds" && (
          <div className="final-config">
            <label>
              Premiers tours
              <select
                value={earlyTarget}
                onChange={(e) => setEarly(Number(e.target.value) as 21 | 25)}
              >
                <option value={21}>21 points</option>
                <option value={25}>25 points</option>
              </select>
            </label>
            <label>
              Finale / Petite finale
              <select
                value={finalTarget}
                onChange={(e) => setFinal(Number(e.target.value) as 21 | 25)}
              >
                <option value={21}>21 points</option>
                <option value={25}>25 points</option>
              </select>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={bronze}
                onChange={(e) => setBronze(e.target.checked)}
              />
              Petite finale
            </label>
          </div>
        )}
        {plan.ties.map((tie) => (
          <section className="tie-panel" key={tie.key}>
            <h3>Un choix sportif est nécessaire</h3>
            <p>{tie.reason}</p>
            <p className="muted">
              {tie.rows
                .map(
                  (r) =>
                    `${source.teamNames[r.teamId]} : rang ${r.place}, ${r.points}/${r.played} pts, ${r.diff > 0 ? "+" : ""}${r.diff}/${r.played} diff.`,
                )
                .join(" · ")}
            </p>
            <div className="tie-selectors">
              {tie.rows.map((_, i) => (
                <label key={i}>
                  Priorité {i + 1}
                  <select
                    aria-label={`Égalité priorité ${i + 1}`}
                    value={decisions[tie.key]?.[i] || ""}
                    onChange={(e) => {
                      const order = [
                        ...(decisions[tie.key] ||
                          Array(tie.rows.length).fill("")),
                      ];
                      order[i] = e.target.value;
                      setDecisions({ ...decisions, [tie.key]: order });
                    }}
                  >
                    <option value="">Choisir une équipe</option>
                    {tie.rows.map((r) => (
                      <option value={r.teamId} key={r.teamId}>
                        {source.teamNames[r.teamId]}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </section>
        ))}
        <div className="ranking-preview">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Position indicative</th>
                  <th>Équipe</th>
                  <th>Rang de groupe</th>
                  <th>Pts / match</th>
                  <th>Diff. / match</th>
                  <th>{purpose === "split" ? "Parcours" : "Sélection"}</th>
                </tr>
              </thead>
              <tbody>
                {plan.rows.map((r, i) => (
                  <tr key={r.teamId}>
                    <td>{i + 1}</td>
                    <td>
                      <strong>{source.teamNames[r.teamId]}</strong>
                    </td>
                    <td>{r.place}</td>
                    <td>{(r.points / r.played).toFixed(3)}</td>
                    <td>{(r.diff / r.played).toFixed(3)}</td>
                    <td>
                      <span className="small-chip">
                        {purpose === "split"
                          ? i < count
                            ? "Principale"
                            : "Consolante"
                          : i < count
                            ? "Qualifiée"
                            : "Non qualifiée"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <small className="muted">
            Les égalités sont appliquées au moment de confirmer. Aucune décision
            antérieure n’est réutilisée.
          </small>
        </div>
        {!validCount && (
          <Hint error>
            Choisissez un nombre entier entre 2 et{" "}
            {purpose === "split" ? available - 2 : Math.min(64, available)}.
          </Hint>
        )}
        {error && <Hint error>{error}</Hint>}
      </div>
      <footer className="modal-footer">
        <button onClick={onClose}>Annuler</button>
        <button
          className="primary"
          disabled={busy || !validCount || unresolved}
          onClick={async () => {
            try {
              if (purpose === "split") {
                await command({
                  type: "split",
                  phaseId: source.id,
                  count,
                  decisions,
                });
                onCreated(source.id);
              } else {
                await command({
                  type: "knockout",
                  phaseId: source.id,
                  lane,
                  count,
                  decisions,
                  earlyTarget,
                  finalTarget,
                  bronze,
                });
                const r = await window.volley.call<Session>("session");
                const p = r.value?.tournament.phases.find(
                  (p) =>
                    p.lane === lane &&
                    p.category === source.category &&
                    p.kind === "knockout",
                );
                if (p) onCreated(p.id);
              }
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          {purpose === "split" ? <GitFork size={17} /> : <Trophy size={17} />}
          Confirmer {purpose === "split" ? "la répartition" : "le tableau"}
        </button>
      </footer>
    </Modal>
  );
}
