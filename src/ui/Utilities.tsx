import { useState } from "react";
import {
  Check,
  ShieldCheck,
  FolderOpen,
  FileCheck2,
  RefreshCw,
  Download,
  History,
} from "lucide-react";
import { useApp, Hint, phaseName } from "./shared";
import type { Rules } from "../domain/types";
export function RulesView() {
  const { session, command, busy, notify, dirty } = useApp();
  const t = session.tournament,
    [rules, setRules] = useState<Rules>(t.rules);
  const locked = t.phases.some((p) => p.status !== "Préparation");
  const change = (next: Rules) => {
    setRules({ ...next, confirmed: false });
    dirty("rules", true);
  };
  return (
    <div className="rules-layout">
      <section className="panel rules-panel">
        <h2>
          <ShieldCheck size={23} />
          Règlement du tournoi
        </h2>
        <p>
          Ces propositions constituent un choix de l’organisateur. Confirmez-les
          avant le premier groupe. Les phases conservent une copie de leur
          règlement.
        </p>
        {locked && (
          <Hint>
            Règlement verrouillé : des phases compétitives ont été confirmées.
          </Hint>
        )}
        <fieldset disabled={locked || busy}>
          <div className="rule-item">
            <div>
              <h3>Score et prolongations</h3>
              <p>
                Victoire au seuil de 21 ou 25 choisi pour la phase. Au-delà,
                arrêt au premier écart requis, sans plafond. 30–28 est valide
                avec un écart de 2.
              </p>
            </div>
            <label>
              Écart requis
              <select
                value={rules.margin}
                onChange={(e) =>
                  change({ ...rules, margin: Number(e.target.value) as 1 | 2 })
                }
              >
                <option value={2}>2 points</option>
                <option value={1}>1 point</option>
              </select>
            </label>
          </div>
          <div className="rule-item">
            <div>
              <h3>Classement dans un groupe</h3>
              <p>
                Victoire : 2 points. Défaite : 1 point. Puis différence de
                points. Pas de confrontation directe implicite. Une égalité
                restante est décidée seulement si elle change une qualification
                ou une tête de série.
              </p>
            </div>
          </div>
          <div className="rule-item">
            <div>
              <h3>Comparaison entre groupes</h3>
              <p>
                Les groupes de 3, 4 et 5 jouent un nombre de matchs différent.
                Les performances comparées sont divisées par le nombre de matchs
                joués, sans arrondi dans le calcul.
              </p>
            </div>
            <label>
              Ordre de priorité
              <select
                value={rules.crossGroup}
                onChange={(e) =>
                  change({
                    ...rules,
                    crossGroup: e.target.value as Rules["crossGroup"],
                  })
                }
              >
                <option value="place-first">
                  Rang de groupe, points/match, différence/match
                </option>
                <option value="performance">
                  Points/match, différence/match
                </option>
              </select>
            </label>
          </div>
          <div className="rule-item">
            <div>
              <h3>Arbitrage et terrains parallèles</h3>
              <p>
                L’équipe au repos arbitre si elle existe. À cinq équipes et deux
                terrains, elle supervise les deux matchs du tour. Sans équipe
                disponible, la mention « Arbitre externe à désigner » reste
                visible ; l’organisateur désigne un arbitre dans les détails de
                la rencontre.
              </p>
            </div>
          </div>
          <div className="rule-item">
            <div>
              <h3>Têtes de série et exemptions</h3>
              <p>
                Le tableau utilise les équipes de la dernière phase de la
                branche. Répartition 1 contre dernière tête de série, puis
                symétrie conventionnelle. Les exemptions reviennent aux
                meilleures têtes de série. Les tours précoces et les finales ont
                des cibles séparées.
              </p>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={rules.bronze}
                  onChange={(e) =>
                    change({ ...rules, bronze: e.target.checked })
                  }
                />
                Proposer une Petite finale par défaut
              </label>
            </div>
          </div>
          <div className="rule-item">
            <div>
              <h3>Retraits et forfaits historiques</h3>
              <p>
                Un retrait conserve les résultats et les matchs prévus ;
                l’équipe est exclue des prochaines phases. Aucun forfait nouveau
                n’est attribué automatiquement. Les forfaits importés gardent
                leur score et leur résultat lorsqu’une migration validée est
                disponible.
              </p>
            </div>
          </div>
        </fieldset>
        <div className="page-bottom">
          <span className="small-chip">
            {t.rules.confirmed
              ? "Règlement confirmé"
              : "À confirmer avant le jeu"}
          </span>
          <button
            className="primary"
            disabled={locked || busy}
            onClick={() =>
              void command({
                type: "rules",
                rules: { ...rules, confirmed: true },
              })
                .then(() => {
                  setRules({ ...rules, confirmed: true });
                  dirty("rules", false);
                  notify(
                    "Règlement confirmé. Vous pouvez préparer les groupes.",
                  );
                })
                .catch(() => {})
            }
          >
            <Check size={17} />
            Confirmer ce règlement
          </button>
        </div>
      </section>
      <aside className="rules-aside">
        <span className="eyebrow">DÉCISIONS EXPLICITES</span>
        <h2>Le jeu doit rester compréhensible.</h2>
        <p>
          Les scores, la qualification et l’ordre des têtes de série suivent ce
          règlement. Aucun ordre alphabétique ne départage une égalité sportive
          décisive.
        </p>
        <Hint>
          Pour un tournoi réel, vérifiez ces choix avec les organisateurs avant
          de confirmer les groupes.
        </Hint>
      </aside>
    </div>
  );
}
export function DocumentsView() {
  const { session, native, busy, notify, guard } = useApp(),
    t = session.tournament;
  const run = async (method: string) => {
    try {
      await native(method, { packageId: t.id });
      notify("Opération terminée.");
    } catch (e) {
      notify((e as Error).message, true);
    }
  };
  return (
    <>
      <div className="stats-row">
        <div className="stat">
          <span>FEUILLES ASSOCIÉES</span>
          <strong>{t.documents.length}</strong>
        </div>
        <div className="stat">
          <span>RÉVISION DU PACKAGE</span>
          <strong>{t.revision}</strong>
        </div>
        <div className="stat">
          <span>CORRECTIONS ARCHIVÉES</span>
          <strong>{t.archives.length}</strong>
        </div>
      </div>
      <section className="panel documents-panel">
        <h2>
          <FolderOpen size={21} />
          Votre package, au même endroit
        </h2>
        <p className="package-path">{session.path}</p>
        <Hint>
          Copiez ou déplacez le dossier .openvolley entier lorsque le tournoi
          est fermé. Il contient tournament.json, documents et history. Chaque
          sauvegarde est atomique et vérifiée par empreinte SHA-256.
        </Hint>
        <div className="utility-actions">
          <button onClick={() => void run("show-documents")}>
            <FolderOpen size={17} />
            Ouvrir le dossier documents
          </button>
          <button disabled={busy} onClick={() => void run("repair-documents")}>
            <RefreshCw size={17} />
            Réparer les feuilles manquantes
          </button>
          <button onClick={() => void run("export-diagnostic")}>
            <Download size={17} />
            Exporter le diagnostic
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Phase</th>
                <th>Document</th>
                <th>Pages</th>
                <th>Révision</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {t.documents.map((d) => {
                const p = t.phases.find((x) => x.id === d.phaseId);
                return (
                  <tr key={d.id}>
                    <td>
                      {p?.lane} · {p && phaseName(p)}
                    </td>
                    <td>
                      {d.groupId
                        ? p?.groups.find((g) => g.id === d.groupId)?.name
                        : `Rencontre ${p?.matches.find((m) => m.id === d.matchId)?.order}`}
                    </td>
                    <td>{d.pages}</td>
                    <td>{d.revision}</td>
                    <td>
                      <button
                        onClick={() =>
                          void native("view-document", { id: d.id }).catch(
                            (e) => notify(e.message, true),
                          )
                        }
                      >
                        Afficher
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel documents-panel">
        <h2>
          <History size={21} />
          Récupération et anciens packages
        </h2>
        <p>
          Les sauvegardes se trouvent dans history et tournament.backup.json.
          Une restauration crée une copie distincte, régénère les feuilles de
          groupes et préserve l’original.
        </p>
        <div className="utility-actions">
          <button
            onClick={() =>
              void guard(async () => {
                await native("restore-copy");
              })
            }
          >
            <RefreshCw size={17} />
            Restaurer une sauvegarde dans une copie
          </button>
          <button
            onClick={async () => {
              try {
                const r = await native<{
                  message: string;
                  files: string[];
                } | null>("legacy-inspect");
                if (r)
                  notify(
                    `${r.message} Fichiers détectés : ${r.files.join(", ")}`,
                    true,
                  );
              } catch (e) {
                notify((e as Error).message, true);
              }
            }}
          >
            <FileCheck2 size={17} />
            Inspecter un ancien package (lecture seule)
          </button>
        </div>
        <p className="muted">
          Aucun format de l’ancienne application n’a été supposé. Les packages
          de cette version sont autonomes ; une migration historique fidèle
          nécessite un exemple source.
        </p>
      </section>
    </>
  );
}
export function HistoryView() {
  const { session } = useApp();
  return (
    <section className="panel history-panel">
      <h2>
        <History size={21} />
        Journal des opérations
      </h2>
      <p>
        Les corrections conservent les anciennes rencontres et phases dans les
        archives du package. Les sauvegardes par révision permettent une
        récupération séparée.
      </p>
      <div className="timeline">
        {[...session.tournament.audit].reverse().map((a) => (
          <article key={a.id}>
            <span className="timeline-dot" />
            <div>
              <strong>{labels[a.action] || a.action}</strong>
              <small>
                {new Date(a.at).toLocaleString("fr-CH")} · Révision {a.revision}
              </small>
              <details>
                <summary>Détails enregistrés</summary>
                <pre>{JSON.stringify(a.detail, null, 2)}</pre>
              </details>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
const labels: Record<string, string> = {
  rules: "Règlement confirmé",
  team: "Effectif enregistré",
  "demo-teams": "Équipes de démonstration ajoutées",
  draft: "Brouillon de groupes créé",
  "draft-update": "Préparation ajustée",
  "draft-delete": "Brouillon supprimé",
  confirm: "Groupes confirmés",
  score: "Résultat enregistré ou corrigé",
  random: "Scores de démonstration générés",
  split: "Principale / Consolante créées",
  knockout: "Tableau final créé",
  withdraw: "Disponibilité d’une équipe modifiée",
  "match-details": "Terrain ou arbitrage modifié",
  sheet: "Feuille de match générée",
  "repair-documents": "Documents vérifiés",
  restoration: "Copie restaurée",
};
