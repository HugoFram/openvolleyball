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
          <span>RÉVISION DU TOURNOI</span>
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
          Dossier du tournoi
        </h2>
        <p className="tournoi-path">{session.path}</p>
        <Hint>
          Copiez ou déplacez le dossier .openvolley entier lorsque le tournoi
          est fermé. Il contient tournament.json, documents et history. Chaque
          sauvegarde est automatique.
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
                      {p ? `${p.lane} · ${phaseName(p)}` : "Inscriptions"}
                    </td>
                    <td>
                      {d.kind === "blank-registration"
                        ? "Fiches vierges"
                        : d.kind === "team-registration"
                          ? t.teams.find((team) => team.id === d.teamId)?.name
                          : d.groupId
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
          Récupération et anciens tournois
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
            Inspecter un ancien tournoi (lecture seule)
          </button>
        </div>
        <p className="muted">
          Aucun format de l’ancienne application n’a été supposé. Les tournois
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
        archives du tournoi. Les sauvegardes par révision permettent une
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
  "bracket-swap": "Équipes échangées dans le tableau final",
  sheet: "Feuille de match générée",
  "repair-documents": "Documents vérifiés",
  "documents-updated": "Feuilles actualisées",
  "registration-sheet": "Fiche d’inscription créée",
  restoration: "Copie restaurée",
};
