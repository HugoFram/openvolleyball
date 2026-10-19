import { useEffect, useState } from "react";
import { Printer, Eye } from "lucide-react";
import type { Category, Session } from "../domain/types";
import { useApp, Modal, Hint } from "./shared";
export function PrinterChoice() {
  const [printer, setPrinter] = useState(localStorage.getItem("printer") || "");
  const [printers, setPrinters] = useState<
    { name: string; displayName: string }[]
  >([]);
  useEffect(() => {
    void window.volley
      .call<{ name: string; displayName: string }[]>("printers")
      .then((r) => {
        if (r.ok) setPrinters(r.value || []);
      });
  }, []);
  return (
    <label>
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
  );
}
export function useRegistrationPrint() {
  const { session, native, notify } = useApp();
  return async (
    options: {
      category?: Category;
      teamId?: string;
      perPage?: 1 | 2;
      pages?: number;
    },
    action: "view" | "print",
    printer?: string,
  ) => {
    try {
      const s = await native<Session>("registration-sheet", {
        packageId: session.tournament.id,
        ...options,
      });
      const doc = s.tournament.documents.at(-1);
      if (!doc) throw new Error("La fiche n’a pas pu être créée.");
      await native(action === "view" ? "view-document" : "print-document", {
        id: doc.id,
        printer: printer || localStorage.getItem("printer") || "",
      });
      return true;
    } catch (error) {
      notify((error as Error).message, true);
      return false;
    }
  };
}
export function PrintTeamSheet({
  teamId,
  printer,
}: {
  teamId: string;
  printer?: string;
}) {
  const print = useRegistrationPrint(),
    { busy } = useApp();
  return (
    <button
      disabled={busy}
      onClick={() => void print({ teamId }, "print", printer)}
    >
      <Printer size={15} />
      Imprimer la fiche
    </button>
  );
}
export function BlankRegistrationSheets({
  category,
  onClose,
}: {
  category: Category;
  onClose: () => void;
}) {
  const [perPage, setPerPage] = useState<1 | 2>(2),
    [pages, setPages] = useState(1);
  const print = useRegistrationPrint(),
    { busy } = useApp();
  return (
    <Modal title="Fiches d’inscription vierges" onClose={onClose}>
      <div className="modal-body">
        <div className="form-row">
          <label>
            Fiches par page
            <select
              aria-label="Fiches par page"
              value={perPage}
              onChange={(e) => setPerPage(Number(e.target.value) as 1 | 2)}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
            </select>
          </label>
          <label>
            Nombre de pages
            <input
              type="number"
              min={1}
              max={50}
              value={pages}
              onChange={(e) => setPages(Number(e.target.value))}
            />
          </label>
        </div>
        <PrinterChoice />
        <Hint>
          {pages * perPage} fiche(s) · {category} · A4
        </Hint>
      </div>
      <footer className="modal-footer">
        <button
          disabled={busy || !Number.isInteger(pages) || pages < 1 || pages > 50}
          onClick={() => void print({ category, perPage, pages }, "view")}
        >
          <Eye size={16} />
          Afficher
        </button>
        <button
          className="primary"
          disabled={busy || !Number.isInteger(pages) || pages < 1 || pages > 50}
          onClick={() => void print({ category, perPage, pages }, "print")}
        >
          <Printer size={16} />
          Imprimer
        </button>
      </footer>
    </Modal>
  );
}
