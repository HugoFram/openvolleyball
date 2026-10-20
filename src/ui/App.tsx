import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  FolderOpen,
  FolderPlus,
  GitFork,
  Users,
  SlidersHorizontal,
  Files,
  History,
  ChevronRight,
  CheckCircle2,
  Trash2,
  RefreshCw,
  ShieldCheck,
  ScanLine,
} from "lucide-react";
import type { Category, Command, Recent, Session } from "../domain/types";
import { Context, Busy, Modal, Hint } from "./shared";
import { Registration } from "./Registration";
import { Progression } from "./Progression";
import { DocumentsView, HistoryView } from "./Utilities";
import { ScansView } from "./Scans";

export function App() {
  const [session, setSession] = useState<Session | null>(null),
    [view, setView] = useState("progression"),
    [category, setCategory] = useState<Category>("Hommes"),
    [editEpoch, setEditEpoch] = useState(0);
  const [busyCount, setBusy] = useState(0),
    [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const [question, setQuestion] = useState<{
    title: string;
    body: string;
    action: string;
    resolve: (v: boolean) => void;
  } | null>(null);
  const current = useRef(session),
    pending = useRef(Promise.resolve()),
    dirty = useRef(new Set<string>()),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function notify(text: string, error = false) {
    setToast({ text, error });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    if (!error) toastTimer.current = setTimeout(() => setToast(null), 4500);
  }
  function confirm(title: string, body: string, action = "Confirmer") {
    return new Promise<boolean>((resolve) =>
      setQuestion({ title, body, action, resolve }),
    );
  }
  async function native<T = unknown>(
    method: string,
    args?: unknown,
  ): Promise<T> {
    const slow = [
      "sheet",
      "repair-documents",
      "restore-copy",
      "create",
      "open",
      "print-document",
      "print-phase",
      "registration-sheet",
    ].includes(method);
    if (slow) setBusy((n) => n + 1);
    try {
      const r = await window.volley.call<T>(method, args);
      if (!r.ok) throw new Error(r.error);
      if (
        r.value &&
        typeof r.value === "object" &&
        "tournament" in r.value &&
        "path" in r.value
      )
        update(r.value as Session);
      return r.value as T;
    } finally {
      if (slow) setBusy((n) => n - 1);
    }
  }
  function update(s: Session | null) {
    current.current = s;
    setSession(s);
  }
  async function guard(fn: () => void | Promise<void>) {
    (document.activeElement as HTMLElement)?.blur();
    await pending.current;
    if (dirty.current.size) {
      const discard = await confirm(
        "Modifications non enregistrées",
        "Certains champs sont incomplets ou invalides. Vous pouvez rester pour les corriger, ou abandonner ces modifications. Les résultats déjà enregistrés sont conservés.",
        "Abandonner les modifications",
      );
      if (!discard) return;
      dirty.current.clear();
      setEditEpoch((n) => n + 1);
    }
    try {
      await fn();
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  async function command(c: Command) {
    const packageId = current.current!.tournament.id;
    const run = pending.current.then(async () => {
      setBusy((n) => n + 1);
      try {
        if (current.current?.tournament.id !== packageId)
          throw new Error("Le tournoi a changé.");
        const result = await native<Session>("command", {
          command: c,
          packageId,
          revision: current.current.tournament.revision,
        });
        update(result);
      } catch (e) {
        notify((e as Error).message, true);
        throw e;
      } finally {
        setBusy((n) => n - 1);
      }
    });
    pending.current = run.catch(() => {});
    return run;
  }
  async function open(path?: string) {
    await guard(async () => {
      const s = await native<Session | null>("open", { path });
      if (s) {
        update(s);
        setCategory("Hommes");
        setView("progression");
        notify("Tournoi ouvert.");
      }
    });
  }
  useEffect(() => {
    native<Session | null>("session")
      .then(update)
      .catch((e) => notify(e.message, true));
  }, []);
  useEffect(() => {
    const close = () => {
      void guard(async () => {
        await native("finish-close");
      });
    };
    window.addEventListener("volley-close", close);
    return () => window.removeEventListener("volley-close", close);
  });
  const nav = [
    { id: "progression", label: "Progression", icon: GitFork },
    { id: "registration", label: "Inscriptions", icon: Users },
    { id: "scans", label: "Feuilles scannées", icon: ScanLine },
    { id: "documents", label: "Exports et diagnostic", icon: Files },
    { id: "history", label: "Historique", icon: History },
  ];
  const t = session?.tournament;
  return (
    <>
      <div className="app-shell">
        <aside className="sidebar">
          <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
            <img src="./assets/volleyball.png" alt="" />
            <span>
              open<span className="brand-light">volleyball</span>
            </span>
          </a>
          {session ? (
            <>
              <div className="sidebar-label">VOTRE TOURNOI</div>
              <div className="tournament-chip">
                <span className="tiny-ball">◉</span>
                <strong>{t!.name}</strong>
                <span className="offline-dot" />
              </div>
              <div className="sidebar-label">ORGANISATION</div>
              <nav>
                {nav.map((n) => (
                  <button
                    key={n.id}
                    aria-label={n.label}
                    className={view === n.id ? "active" : ""}
                    onClick={() => void guard(() => setView(n.id))}
                  >
                    <n.icon size={19} />
                    <span>
                      {n.label}
                      {n.id === "scans" && (
                        <small className="experimental-nav">Expérimental</small>
                      )}
                    </span>
                    {view === n.id && <ChevronRight size={16} />}
                  </button>
                ))}
              </nav>
              <div className="sidebar-bottom">
                <button className="switch-button" onClick={() => void open()}>
                  <FolderOpen size={18} />
                  Ouvrir un autre tournoi
                </button>
                <button
                  className="subtle"
                  onClick={() => void guard(() => setView("start"))}
                >
                  <FolderPlus size={16} />
                  Créer un autre tournoi
                </button>
              </div>
            </>
          ) : (
            <div className="start-side">
              <div className="ball-art">
                <img src="./assets/volleyball.png" alt="Ballon de volleyball" />
              </div>
            </div>
          )}
        </aside>
        <main className="main">
          <header className="topbar">
            <div>
              Open Volleyball <ChevronRight size={14} />
              <span>
                {session
                  ? nav.find((n) => n.id === view)?.label || "Nouveau tournoi"
                  : "Bienvenue"}
              </span>
            </div>
          </header>
          {!session || view === "start" ? (
            <Start
              native={native}
              onCreated={(s) => {
                update(s);
                setView("registration");
                setCategory("Hommes");
              }}
              open={open}
              notify={notify}
            />
          ) : (
            <Context.Provider
              value={{
                session,
                busy: busyCount > 0,
                command,
                native,
                notify,
                confirm,
                dirty: (key, value) => {
                  if (value) dirty.current.add(key);
                  else dirty.current.delete(key);
                },
                guard,
              }}
            >
              <div className="content" key={`${t!.id}-${editEpoch}`}>
                <div className="page-heading">
                  <div className="heading-line">
                    <h1>{nav.find((n) => n.id === view)?.label}</h1>
                    {["progression", "registration"].includes(view) && (
                      <div
                        className="category-selector"
                        role="group"
                        aria-label="Catégorie"
                      >
                        {(["Hommes", "Femmes"] as Category[]).map((c) => (
                          <button
                            key={c}
                            className={category === c ? "selected" : ""}
                            onClick={() => void guard(() => setCategory(c))}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {view === "progression" ? (
                  <Progression
                    key={`${t!.id}-${category}`}
                    category={category}
                    onRegister={() => setView("registration")}
                  />
                ) : view === "registration" ? (
                  <Registration
                    key={`${t!.id}-${category}`}
                    category={category}
                    onProgress={() => setView("progression")}
                  />
                ) : view === "documents" ? (
                  <DocumentsView />
                ) : view === "scans" ? (
                  <ScansView />
                ) : (
                  <HistoryView />
                )}
              </div>
            </Context.Provider>
          )}
        </main>
      </div>
      {busyCount > 0 && <Busy />}
      {toast && (
        <div
          className={`toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          <CheckCircle2 size={20} />
          <span>{toast.text}</span>
          <button
            aria-label="Fermer la notification"
            onClick={() => setToast(null)}
          >
            ×
          </button>
        </div>
      )}
      {question && (
        <Modal
          title={question.title}
          onClose={() => {
            question.resolve(false);
            setQuestion(null);
          }}
        >
          <p className="confirm-copy">{question.body}</p>
          <footer className="modal-footer">
            <button
              onClick={() => {
                question.resolve(false);
                setQuestion(null);
              }}
            >
              Rester / Annuler
            </button>
            <button
              className="primary"
              onClick={() => {
                question.resolve(true);
                setQuestion(null);
              }}
            >
              {question.action}
            </button>
          </footer>
        </Modal>
      )}
    </>
  );
}
function Start({
  native,
  onCreated,
  open,
  notify,
}: {
  native: <T = unknown>(m: string, a?: unknown) => Promise<T>;
  onCreated: (s: Session) => void;
  open: (p?: string) => Promise<void>;
  notify: (s: string, e?: boolean) => void;
}) {
  const [name, setName] = useState(""),
    [parent, setParent] = useState(""),
    [logoPath, setLogoPath] = useState(""),
    [website, setWebsite] = useState(""),
    [recents, setRecents] = useState<Recent[]>([]),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    native<Recent[]>("recents").then(setRecents);
  }, []);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="welcome">
      <h1>Tournois</h1>
      <section className="panel create-panel">
        <div className="section-title">
          <span className="title-icon">
            <FolderPlus size={22} />
          </span>
          <div>
            <h2>Créer ou ouvrir un tournoi</h2>
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () =>
              onCreated(
                await native<Session>("create", {
                  name,
                  parent,
                  logoPath,
                  website,
                }),
              ),
            );
          }}
        >
          <label>
            Nom du tournoi
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex. Tournoi des Alpes 2026"
              required
              maxLength={120}
            />
          </label>
          <label>
            Destination du nouveau tournoi
            <div className="input-button">
              <input
                value={parent}
                onChange={(e) => setParent(e.target.value)}
                placeholder="Choisir un dossier sur votre ordinateur"
                required
              />
              <button
                type="button"
                onClick={() =>
                  void run(async () => {
                    const path = await native<string | null>(
                      "choose-destination",
                    );
                    if (path) setParent(path);
                  })
                }
              >
                <FolderOpen size={17} />
                Parcourir
              </button>
            </div>
          </label>
          <label>
            Logo (facultatif)
            <div className="input-button">
              <input
                aria-label="Fichier du logo"
                value={logoPath}
                onChange={(e) => setLogoPath(e.target.value)}
                placeholder="PNG ou JPEG"
              />
              <button
                type="button"
                onClick={() =>
                  void run(async () => {
                    const file = await native<string | null>("choose-logo");
                    if (file) setLogoPath(file);
                  })
                }
              >
                <FolderOpen size={17} />
                Parcourir le logo
              </button>
            </div>
          </label>
          <label>
            Site web (facultatif)
            <input
              aria-label="Site web"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://exemple.ch"
            />
          </label>
          <button className="primary full" disabled={busy}>
            Créer le tournoi
            <ArrowRight size={18} />
          </button>
        </form>
        <div className="divider">
          <span>ou</span>
        </div>
        <button className="full" disabled={busy} onClick={() => void open()}>
          <FolderOpen size={18} />
          Ouvrir un tournoi existant
        </button>
      </section>
      <section className="recent-section">
        <div className="section-title">
          <h2>Tournois récents</h2>
          <span className="muted">{recents.length}</span>
        </div>
        {recents.length === 0 ? (
          <p className="muted">Vos tournois ouverts apparaîtront ici.</p>
        ) : (
          recents.map((r) => (
            <div className="recent-row" key={r.path}>
              <FolderOpen size={20} />
              <div>
                <strong>{r.name}</strong>
                <small title={r.path}>{r.path}</small>
              </div>
              <button
                title="Ouvrir le récent"
                onClick={() => void open(r.path)}
              >
                <ArrowRight size={18} />
                <span className="sr-only">Ouvrir le récent {r.name}</span>
              </button>
              <button
                className="icon-button"
                aria-label={`Retirer ${r.name} des récents`}
                onClick={() =>
                  void run(async () =>
                    setRecents(
                      await native<Recent[]>("remove-recent", { path: r.path }),
                    ),
                  )
                }
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </section>
      <button
        className="subtle"
        onClick={() =>
          void run(async () => {
            const s = await native<Session | null>("restore-copy");
            if (s) onCreated(s);
          })
        }
      >
        <RefreshCw size={15} />
        Restaurer une sauvegarde dans une copie
      </button>
    </div>
  );
}
