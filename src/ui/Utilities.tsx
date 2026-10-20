import { useState } from "react";
import { Download, Copy, History } from "lucide-react";
import { useApp } from "./shared";

export function DocumentsView() {
  const { session, native, busy, notify } = useApp();
  const [working, setWorking] = useState<string>();
  async function run(
    method: "snapshot-tournament" | "export-players" | "export-players-xlsx",
  ) {
    setWorking(method);
    try {
      const result = await native<{ path: string; count?: number } | null>(
        method,
        { packageId: session.tournament.id },
      );
      if (result)
        notify(
          method === "snapshot-tournament"
            ? `Backup créé : ${result.path}`
            : `${result.count} joueurs exportés : ${result.path}`,
        );
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setWorking(undefined);
    }
  }
  return (
    <section className="panel documents-panel">
      <div className="utility-actions">
        <button
          disabled={busy || !!working}
          onClick={() => void run("snapshot-tournament")}
        >
          <Copy size={18} />
          {working === "snapshot-tournament"
            ? "Copie du tournoi…"
            : "Créer un backup du tournoi"}
        </button>
        <button
          disabled={busy || !!working}
          onClick={() => void run("export-players")}
        >
          <Download size={18} />
          {working === "export-players"
            ? "Export en cours…"
            : "Exporter les joueurs (CSV)"}
        </button>
        <button
          disabled={busy || !!working}
          onClick={() => void run("export-players-xlsx")}
        >
          <Download size={18} />
          {working === "export-players-xlsx"
            ? "Export en cours…"
            : "Exporter les joueurs (Excel .xlsx)"}
        </button>
      </div>
    </section>
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
