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
import { levelLetter, levelLegend, playerLevels } from "../domain/levels";
import { BlankRegistrationSheets } from "./RegistrationSheets";
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
    [search, setSearch] = useState(""),
    [blankSheets, setBlankSheets] = useState(false);
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
      <div className="stats-row registration-stats">
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
          <button onClick={() => setBlankSheets(true)}>
            Fiches d’inscription vierges
          </button>
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
                    <span className="level-badge">{levelLetter(p.level)}</span>
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
        <button className="primary" onClick={onProgress}>
          Préparer le tournoi
          <ArrowRight size={17} />
        </button>
      </div>
      {blankSheets && (
        <BlankRegistrationSheets
          category={category}
          onClose={() => setBlankSheets(false)}
        />
      )}
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
              disabled={team.players.length >= 4}
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
          <p className="level-legend">{levelLegend}</p>
          <div className="player-header">
            <span>Nom *</span>
            <span>Niveau</span>
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
              <select
                aria-label={`Niveau joueur ${i + 1}`}
                value={p.level}
                onKeyDown={(e) => {
                  const level = playerLevels.find(
                    (level) => level.letter === e.key.toUpperCase(),
                  );
                  if (level && !e.ctrlKey && !e.altKey && !e.metaKey) {
                    e.preventDefault();
                    change({
                      ...team,
                      players: team.players.map((x) =>
                        x.id === p.id ? { ...x, level: level.value } : x,
                      ),
                    });
                  }
                }}
                onChange={(e) =>
                  change({
                    ...team,
                    players: team.players.map((x) =>
                      x.id === p.id
                        ? { ...x, level: Number(e.target.value) }
                        : x,
                    ),
                  })
                }
              >
                {playerLevels.map((level) => (
                  <option key={level.letter} value={level.value}>
                    {level.letter}
                  </option>
                ))}
              </select>
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
                disabled={team.players.length <= 3}
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

          {error && <Hint error>{error}</Hint>}
        </div>
        <footer className="modal-footer">
          <button type="button" onClick={() => void close()}>
            Annuler
          </button>
          <button
            className="primary"
            disabled={
              busy || team.players.length < 3 || team.players.length > 4
            }
          >
            Enregistrer l’équipe
          </button>
        </footer>
      </form>
    </Modal>
  );
}
