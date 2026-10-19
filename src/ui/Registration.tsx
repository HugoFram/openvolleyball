import { useEffect, useState } from "react";
import {
  Plus,
  ArrowRight,
  WandSparkles,
  Pencil,
  UserRound,
  Trash2,
} from "lucide-react";
import type { Category, Team } from "../domain/types";
import { id, strength } from "../domain/engine";
import { useApp, Modal, Hint } from "./shared";
export function Registration({
  category,
  onProgress,
}: {
  category: Category;
  onProgress: () => void;
}) {
  const { session, command, busy, confirm, dirty, notify } = useApp();
  const t = session.tournament;
  const teams = t.teams.filter((x) => x.category === category),
    locked = t.phases.some(
      (p) => p.category === category && p.status !== "Préparation",
    ),
    hasDraft = t.phases.some(
      (p) => p.category === category && p.status === "Préparation",
    );
  const [editing, setEditing] = useState<Team | null>(null),
    [count, setCount] = useState(16),
    [search, setSearch] = useState("");
  const player = () => ({ id: id(), name: "", level: 1, email: "", club: "" });
  const add = () =>
    setEditing({
      id: id(),
      name: "",
      category,
      players: [player(), player(), player()],
      withdrawn: false,
    });
  return (
    <>
      <div className="stats-row">
        <div className="stat">
          <span>ÉQUIPES INSCRITES</span>
          <strong>
            {teams.length}
            <small> / {category}</small>
          </strong>
        </div>
        <div className="stat">
          <span>JOUEURS SUR LE TERRAIN</span>
          <strong>{teams.reduce((s, t) => s + t.players.length, 0)}</strong>
        </div>
        <div className="stat">
          <span>NIVEAU MOYEN</span>
          <strong>
            {(
              teams.reduce((s, t) => s + strength(t), 0) /
              Math.max(1, teams.length)
            ).toFixed(2)}
            <small> / 3</small>
          </strong>
        </div>
      </div>
      {locked && (
        <Hint>
          Les effectifs sont verrouillés dès la confirmation des groupes. Un
          retrait exclut l’équipe des prochaines phases ; les matchs et
          résultats historiques sont conservés.
        </Hint>
      )}
      {!locked && hasDraft && (
        <Hint>
          Un brouillon est en préparation : vous pouvez modifier les équipes
          existantes. Supprimez ce brouillon avant d’ajouter des équipes.
        </Hint>
      )}
      <div className="toolbar">
        <h2>
          Les effectifs <span className="count">{teams.length}</span>
        </h2>
        <div className="actions">
          <input
            className="search"
            aria-label="Rechercher une équipe"
            placeholder="Rechercher une équipe…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {!locked && (
            <button className="primary" disabled={hasDraft} onClick={add}>
              <Plus size={17} />
              Ajouter une équipe
            </button>
          )}
        </div>
      </div>
      <div className="team-grid">
        {teams
          .filter((x) =>
            x.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
          )
          .map((team) => (
            <article
              className={`panel team-card ${team.withdrawn ? "withdrawn" : ""}`}
              key={team.id}
            >
              <div className="team-title">
                <div className="avatar">
                  {team.name.slice(0, 2).toLocaleUpperCase()}
                </div>
                <div>
                  <h3>{team.name}</h3>
                  <span>
                    {team.players.length} joueurs ·{" "}
                    {team.withdrawn ? "Retirée" : category}
                  </span>
                </div>
                <span className="level-badge">{strength(team).toFixed(2)}</span>
              </div>
              <div className="roster">
                {team.players.map((p) => (
                  <div key={p.id}>
                    <UserRound size={14} />
                    <span>{p.name}</span>
                    <span
                      className="level-dots"
                      aria-label={`Niveau ${p.level}`}
                    >
                      {[0, 1, 2].map((n) => (
                        <i key={n} className={n < p.level ? "filled" : ""} />
                      ))}
                    </span>
                  </div>
                ))}
              </div>
              <footer>
                {!locked ? (
                  <button
                    className="subtle"
                    onClick={() => setEditing(structuredClone(team))}
                  >
                    <Pencil size={14} />
                    Modifier l’équipe
                  </button>
                ) : (
                  <button
                    className="subtle"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await confirm(
                          team.withdrawn
                            ? "Réintégrer l’équipe ?"
                            : "Retirer l’équipe ?",
                          "Ce changement concerne les prochaines phases. Les rencontres déjà programmées restent à jouer.",
                          team.withdrawn ? "Réintégrer" : "Retirer",
                        )
                      )
                        void command({
                          type: "withdraw",
                          teamId: team.id,
                          withdrawn: !team.withdrawn,
                        }).catch(() => {});
                    }}
                  >
                    {team.withdrawn
                      ? "Réintégrer"
                      : "Retirer des prochaines phases"}
                  </button>
                )}
              </footer>
            </article>
          ))}
      </div>
      {!locked && (
        <section className="demo-strip">
          <div>
            <WandSparkles size={23} />
            <div>
              <h3>Explorer avec des équipes de démonstration</h3>
              <p>Ajout volontaire, noms uniques, effectifs de 3 à 4 joueurs.</p>
            </div>
          </div>
          <div className="actions">
            <label className="inline-label">
              Nombre
              <input
                type="number"
                min={1}
                max={200}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              />
            </label>
            <button
              disabled={busy || hasDraft}
              onClick={() =>
                void command({ type: "demo-teams", category, count })
                  .then(() => notify("Équipes de démonstration ajoutées."))
                  .catch(() => {})
              }
            >
              <WandSparkles size={16} />
              Générer des équipes
            </button>
          </div>
        </section>
      )}
      <div className="page-bottom">
        <span className="muted">
          {teams.length >= 3
            ? "Les équipes sont prêtes pour la préparation des groupes."
            : "Ajoutez au moins 3 équipes pour commencer."}
        </span>
        <button className="primary" onClick={onProgress}>
          Préparer le tournoi
          <ArrowRight size={17} />
        </button>
      </div>
      {editing && (
        <TeamEditor initial={editing} onClose={() => setEditing(null)} />
      )}
    </>
  );
}
function TeamEditor({
  initial,
  onClose,
}: {
  initial: Team;
  onClose: () => void;
}) {
  const { command, busy, dirty, confirm } = useApp();
  const [team, setTeam] = useState(initial),
    [error, setError] = useState(""),
    [changed, setChanged] = useState(false);
  useEffect(() => () => dirty("team-editor", false), []);
  const change = (next: Team) => {
    setTeam(next);
    setChanged(true);
    dirty("team-editor", true);
  };
  const close = async () => {
    if (
      !changed ||
      (await confirm(
        "Abandonner la fiche ?",
        "Les modifications de cette équipe ne sont pas encore enregistrées.",
        "Abandonner",
      ))
    )
      onClose();
  };
  return (
    <Modal
      title={initial.name ? "Modifier l’équipe" : "Ajouter une équipe"}
      onClose={() => void close()}
      wide
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await command({ type: "team", team });
            dirty("team-editor", false);
            onClose();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <div className="modal-body">
          <label>
            Nom de l’équipe
            <input
              value={team.name}
              maxLength={120}
              onChange={(e) => change({ ...team, name: e.target.value })}
              required
              placeholder="Ex. Les Chamois"
            />
          </label>
          <div className="toolbar">
            <h3>
              Joueurs <span className="count">{team.players.length}</span>
            </h3>
            <button
              type="button"
              onClick={() =>
                change({
                  ...team,
                  players: [
                    ...team.players,
                    { id: id(), name: "", level: 1, email: "", club: "" },
                  ],
                })
              }
            >
              <Plus size={15} />
              Ajouter un joueur
            </button>
          </div>
          <div className="player-header">
            <span>Nom *</span>
            <span>Niveau (0–3)</span>
            <span>E-mail (facultatif)</span>
            <span>Club (facultatif)</span>
            <span />
          </div>
          {team.players.map((p, i) => (
            <div className="player-row" key={p.id}>
              <input
                aria-label={`Nom joueur ${i + 1}`}
                value={p.name}
                required
                onChange={(e) =>
                  change({
                    ...team,
                    players: team.players.map((x) =>
                      x.id === p.id ? { ...x, name: e.target.value } : x,
                    ),
                  })
                }
              />
              <input
                aria-label={`Niveau joueur ${i + 1}`}
                type="number"
                min={0}
                max={3}
                value={Number.isNaN(p.level) ? "" : p.level}
                required
                onChange={(e) =>
                  change({
                    ...team,
                    players: team.players.map((x) =>
                      x.id === p.id
                        ? {
                            ...x,
                            level:
                              e.target.value === ""
                                ? NaN
                                : Number(e.target.value),
                          }
                        : x,
                    ),
                  })
                }
              />
              <input
                type="email"
                aria-label={`E-mail joueur ${i + 1}`}
                value={p.email}
                onChange={(e) =>
                  change({
                    ...team,
                    players: team.players.map((x) =>
                      x.id === p.id ? { ...x, email: e.target.value } : x,
                    ),
                  })
                }
              />
              <input
                aria-label={`Club joueur ${i + 1}`}
                value={p.club}
                onChange={(e) =>
                  change({
                    ...team,
                    players: team.players.map((x) =>
                      x.id === p.id ? { ...x, club: e.target.value } : x,
                    ),
                  })
                }
              />
              <button
                type="button"
                className="icon-button"
                aria-label={`Retirer joueur ${i + 1}`}
                disabled={team.players.length === 1}
                onClick={() =>
                  change({
                    ...team,
                    players: team.players.filter((x) => x.id !== p.id),
                  })
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <p className="muted">
            Le niveau moyen est calculé sur tous les joueurs. Les niveaux
            restent éditables au clavier.
          </p>
          {error && <Hint error>{error}</Hint>}
        </div>
        <footer className="modal-footer">
          <button type="button" onClick={() => void close()}>
            Annuler
          </button>
          <button className="primary" disabled={busy}>
            Enregistrer l’équipe
          </button>
        </footer>
      </form>
    </Modal>
  );
}
