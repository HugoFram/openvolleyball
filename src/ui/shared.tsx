import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { X, LoaderCircle, Check, AlertCircle } from "lucide-react";
import type { Command, Session } from "../domain/types";
export interface Controls {
  session: Session;
  busy: boolean;
  command: (c: Command) => Promise<void>;
  native: <T = unknown>(method: string, args?: unknown) => Promise<T>;
  notify: (s: string, error?: boolean) => void;
  confirm: (title: string, body: string, action?: string) => Promise<boolean>;
  dirty: (key: string, value: boolean) => void;
  guard: (fn: () => void | Promise<void>) => Promise<void>;
}
export const Context = createContext<Controls>(null!);
export const useApp = () => useContext(Context);
export function Status({ status }: { status: string }) {
  return (
    <span
      className={`status ${status === "Terminée" ? "done" : status === "Préparation" ? "draft" : "live"}`}
    >
      {status === "Terminée" ? <Check size={12} /> : <span className="dot" />}
      {status}
    </span>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>("input,button,select");
    first?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const nodes = Array.from(
          el?.querySelectorAll<HTMLElement>(
            "button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea,a[href]",
          ) || [],
        );
        if (!nodes.length) return;
        if (e.shiftKey && document.activeElement === nodes[0]) {
          e.preventDefault();
          nodes.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
          e.preventDefault();
          nodes[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-shade"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon-button" aria-label="Fermer" onClick={onClose}>
            <X size={21} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">◎</div>
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
export function Busy() {
  return (
    <div className="busy">
      <LoaderCircle size={17} className="spin" /> Enregistrement et préparation
      des documents…
    </div>
  );
}
export function Hint({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div className={error ? "hint error" : "hint"}>
      {error ? <AlertCircle size={16} /> : null}
      <span>{children}</span>
    </div>
  );
}
export const phaseName = (p: { kind: string; number: number }) =>
  p.kind === "knockout"
    ? "Phase finale"
    : p.number === 1
      ? "Groupes initiaux"
      : `Groupes ${p.number}`;
