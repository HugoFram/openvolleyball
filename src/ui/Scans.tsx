import { useEffect, useRef, useState } from "react";
import {
  Upload,
  FileCheck2,
  ScanLine,
  Check,
  Save,
  ZoomIn,
  Download,
} from "lucide-react";
import { useApp, Hint, Modal } from "./shared";
import type { Session } from "../domain/types";
import type { PaperForm, Rect, ScanPage, ScanValue } from "../domain/scans";
import { currentForm } from "../domain/scans";
import { defaultRules, validateScore } from "../domain/engine";
import { createScanReader, scannedPages } from "../scan/import";
import { normalizedScale } from "../scan/geometry";
import { localRect } from "../scan/handwriting";
type ReaderStatus = {
  installed: boolean;
  name: string;
  enabled: boolean;
  cpu: boolean;
};

export function ScansView() {
  const { session, native, notify, dirty, busy, confirm } = useApp();
  const live = useRef(session);
  live.current = session;
  const [working, setWorking] = useState(false),
    [progress, setProgress] = useState(""),
    [selected, setSelected] = useState<string>(),
    [filter, setFilter] = useState("pending"),
    [zoom, setZoom] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [advanced, setAdvanced] = useState<ReaderStatus>({
    installed: false,
    name: "",
    enabled: false,
    cpu: false,
  });
  const [configuring, setConfiguring] = useState(false);
  const reviewChanged = useRef(false);
  const [reviewEpoch, setReviewEpoch] = useState(0);
  const t = session.tournament,
    pages = t.scanPages || [],
    sources = t.scanSources || [];
  const visible = pages.filter((s) => filter === "all" || s.status === filter);
  const page = visible.find((s) => s.id === selected) || visible[0];
  const canceled = useRef(false);
  const reader = useRef<ReturnType<typeof createScanReader> | undefined>(
    undefined,
  );
  const [image, setImage] = useState("");
  useEffect(() => {
    void native<ReaderStatus>("registration-reader-status", { packageId: t.id })
      .then(setAdvanced)
      .catch((e) => notify(e.message, true));
  }, [t.id]);
  async function configureReader(
    install: boolean,
    enabled = advanced.enabled,
    cpu = advanced.cpu,
  ) {
    setConfiguring(true);
    try {
      const status = await native<ReaderStatus | null>(
        install
          ? "registration-reader-install"
          : "registration-reader-settings",
        { packageId: t.id, enabled, cpu },
      );
      if (status) setAdvanced(status);
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setConfiguring(false);
    }
  }
  async function navigate(action: () => void) {
    if (
      reviewChanged.current &&
      !(await confirm(
        "Modifications non enregistrées",
        "Enregistrez le brouillon pour conserver vos corrections, ou abandonnez-les pour changer de feuille.",
        "Abandonner les modifications",
      ))
    )
      return;
    if (reviewChanged.current) {
      reviewChanged.current = false;
      dirty(`scan-review-${page?.id}`, false);
      setReviewEpoch((n) => n + 1);
    }
    action();
  }
  useEffect(() => {
    let stopped = false;
    setImage("");
    if (page)
      native<Uint8Array>("scan-image", { packageId: t.id, id: page.id })
        .then((bytes) => {
          if (stopped) return;
          const blob = new Blob([new Uint8Array(bytes)], { type: "image/png" });
          const reader = new FileReader();
          reader.onload = () => {
            if (!stopped) setImage(reader.result as string);
          };
          reader.readAsDataURL(blob);
        })
        .catch((e) => notify(e.message, true));
    return () => {
      stopped = true;
    };
  }, [page?.id, t.id]);
  async function mutate(method: string, args: object = {}) {
    const current = live.current.tournament;
    const s = await native<Session>(method, {
      ...args,
      packageId: current.id,
      revision: current.revision,
    });
    live.current = s;
    return s;
  }
  async function processSources(s: Session) {
    for (const source of s.tournament.scanSources?.filter(
      (s) => !s.processed,
    ) || []) {
      try {
        const bytes = await native<Uint8Array>("scan-source", {
          packageId: s.tournament.id,
          id: source.id,
        });
        let number = 0;
        for await (const canvas of scannedPages(
          new Uint8Array(bytes),
          source.file.endsWith(".pdf"),
        )) {
          if (canceled.current) return;
          number++;
          setProgress(`${source.name} · page ${number}`);
          const results = await reader.current!.analyze(
            canvas,
            live.current.tournament.paperForms || [],
            s.tournament.id,
            (field) =>
              setProgress(`${source.name} · page ${number} · ${field}`),
          );
          canvas.width = canvas.height = 0;
          if (canceled.current) return;
          await mutate("scan-page", {
            sourceId: source.id,
            page: number,
            results,
          });
        }
        if (!canceled.current) await mutate("scan-finish", { id: source.id });
      } catch (error) {
        if (!canceled.current)
          await mutate("scan-finish", {
            id: source.id,
            error: (error as Error).message,
          });
      }
    }
  }
  async function run(importNew: boolean) {
    canceled.current = false;
    setWorking(true);
    dirty("scan-processing", true);
    try {
      const s = importNew ? await mutate("scan-import") : live.current;
      const settings = await native<ReaderStatus>(
        "registration-reader-status",
        { packageId: s.tournament.id },
      );
      setAdvanced(settings);
      let startup: Promise<unknown> | undefined;
      reader.current = createScanReader(
        settings.enabled
          ? {
              transcribe: async (image, kind) => {
                startup ??= native("registration-reader-start", {
                  packageId: s.tournament.id,
                });
                await startup;
                if (canceled.current) throw Error("Analyse interrompue.");
                return native<string>("registration-reader-read", {
                  packageId: s.tournament.id,
                  image,
                  kind,
                });
              },
              stop: () => {
                void native("registration-reader-stop").catch(() => {});
              },
            }
          : undefined,
      );
      await processSources(s);
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      reader.current?.dispose();
      setWorking(false);
      dirty("scan-processing", false);
      setProgress("");
    }
  }
  useEffect(
    () => () => {
      canceled.current = true;
      reader.current?.dispose();
      dirty("scan-processing", false);
    },
    [],
  );
  return (
    <>
      <div className="hint experimental-scans" role="note">
        <strong>Fonction expérimentale</strong>
        <span>
          La reconnaissance des inscriptions n’est pas encore validée sur des
          écritures variées. Vérifiez les noms, les e-mails et les scores avant
          de les enregistrer.
        </span>
      </div>
      <div className="reader-settings">
        <label>
          Lecture des inscriptions
          <select
            aria-label="Lecteur des inscriptions"
            value={advanced.enabled ? "advanced" : "compact"}
            disabled={working || busy || configuring}
            onChange={(e) =>
              void configureReader(false, e.target.value === "advanced")
            }
          >
            <option value="compact">Lecteur intégré</option>
            <option value="advanced" disabled={!advanced.installed}>
              Lecteur avancé local{advanced.name ? ` · ${advanced.name}` : ""}
            </option>
          </select>
        </label>
        <button
          disabled={working || busy || configuring}
          onClick={() => void configureReader(true)}
        >
          {configuring
            ? "Vérification du lecteur…"
            : advanced.installed
              ? "Changer le lecteur avancé…"
              : "Installer le lecteur avancé…"}
        </button>
        {advanced.enabled && (
          <label className="reader-cpu">
            <input
              type="checkbox"
              checked={advanced.cpu}
              disabled={working || busy || configuring}
              onChange={(e) =>
                void configureReader(false, true, e.target.checked)
              }
            />
            Utiliser seulement le processeur
          </label>
        )}
        <span className="muted">
          Pack local facultatif · aucun envoi de vos feuilles
        </span>
      </div>
      <div className="toolbar">
        <div className="actions">
          <button
            className="primary"
            disabled={working || busy || configuring}
            onClick={() => void run(true)}
          >
            <Upload size={17} />
            Importer des scans
          </button>
          {sources.some((s) => !s.processed) && (
            <button
              disabled={working || busy || configuring}
              onClick={() => void run(false)}
            >
              <ScanLine size={17} />
              Reprendre l’analyse
            </button>
          )}
          {(["scores", "registration"] as const).map(
            (kind) =>
              pages.some(
                (p) =>
                  p.status === "approved" &&
                  t.paperForms?.some(
                    (f) => f.id === p.formId && f.kind === kind,
                  ),
              ) && (
                <button
                  key={kind}
                  title={
                    kind === "registration"
                      ? "Images et textes corrigés, avec les noms et e-mails. Aucun envoi automatique."
                      : undefined
                  }
                  disabled={working || busy || exporting}
                  onClick={() =>
                    void (async () => {
                      setExporting(true);
                      try {
                        const current = live.current.tournament;
                        const result = await native<{
                          path: string;
                          count: number;
                          skipped: number;
                        } | null>(
                          kind === "registration"
                            ? "scan-export-registrations"
                            : "scan-export-reviewed",
                          {
                            packageId: current.id,
                            revision: current.revision,
                          },
                        );
                        if (result)
                          notify(
                            `${result.count} ${kind === "registration" ? "champs d’inscription" : "scores relus"} exportés dans ${result.path}${result.skipped ? ` · ${result.skipped} extraits ignorés` : ""}.`,
                          );
                      } catch (error) {
                        notify((error as Error).message, true);
                      } finally {
                        setExporting(false);
                      }
                    })()
                  }
                >
                  <Download size={17} />
                  {exporting
                    ? "Export en cours…"
                    : kind === "registration"
                      ? "Exporter les inscriptions relues"
                      : "Exporter les scores relus"}
                </button>
              ),
          )}
          <span className="muted">
            Lecture locale · aucune connexion Internet
          </span>
          {working && (
            <button
              onClick={() => {
                canceled.current = true;
                reader.current?.dispose();
              }}
            >
              Interrompre l’analyse
            </button>
          )}
        </div>
      </div>
      {working && (
        <div className="hint" role="status">
          Analyse en cours… {progress}
        </div>
      )}
      {sources
        .filter((s) => s.error)
        .map((s) => (
          <Hint key={s.id} error>
            {s.name} : {s.error}
          </Hint>
        ))}
      <div className="scan-layout">
        <aside className="panel scan-inbox">
          <label>
            Feuilles
            <select
              value={filter}
              disabled={working}
              onChange={(e) => {
                const value = e.target.value;
                void navigate(() => {
                  setFilter(value);
                  setSelected(undefined);
                });
              }}
            >
              <option value="pending">
                À vérifier ({pages.filter((s) => s.status === "pending").length}
                )
              </option>
              <option value="approved">Validées</option>
              <option value="ignored">Écartées</option>
              <option value="all">Toutes</option>
            </select>
          </label>
          {visible.map((s) => {
            const f = t.paperForms?.find((f) => f.id === s.formId),
              source = sources.find((x) => x.id === s.sourceId);
            return (
              <button
                className={`scan-item ${page?.id === s.id ? "selected" : ""}`}
                key={s.id}
                disabled={working}
                onClick={() => void navigate(() => setSelected(s.id))}
              >
                <FileCheck2 size={18} />
                <span>
                  <strong>{f?.label || "Feuille non identifiée"}</strong>
                  <small>
                    {source?.name} · page {s.page}
                  </small>
                  <small>
                    {s.status === "approved"
                      ? "Validée"
                      : s.status === "ignored"
                        ? "Écartée"
                        : "À vérifier"}
                  </small>
                </span>
              </button>
            );
          })}
          {!visible.length && (
            <p className="muted">
              Aucune feuille{" "}
              {filter === "pending" ? "à vérifier" : "dans cette liste"}.
            </p>
          )}
        </aside>
        {page ? (
          <section className="scan-workspace" key={page.id}>
            <div className="panel scan-preview">
              <button onClick={() => setZoom(true)} disabled={!image}>
                <ZoomIn size={17} />
                Agrandir la feuille
              </button>
              {image && <img src={image} alt="Feuille scannée" />}
            </div>
            <Review
              key={`${page.id}-${page.formId || "unknown"}-${reviewEpoch}`}
              page={page}
              image={image}
              disabled={working || busy}
              mutate={mutate}
              onChanged={(value) => {
                reviewChanged.current = value;
              }}
            />
          </section>
        ) : (
          <section className="panel scan-empty">
            <ScanLine size={36} />
            <h2>Importer des feuilles remplies</h2>
            <p>
              PDF multipages, PNG ou JPEG. Imprimez les nouvelles feuilles avec
              QR code, remplissez-les puis scannez-les.
            </p>
            <p>
              Les scores et les inscriptions manuscrites sont proposés pour
              relecture à côté de leur image. Les demi-feuilles découpées sont
              acceptées.
            </p>
          </section>
        )}
      </div>
      {zoom && (
        <Modal title="Feuille scannée" wide onClose={() => setZoom(false)}>
          <div className="scan-zoom">
            <img src={image} alt="Feuille scannée agrandie" />
          </div>
        </Modal>
      )}
    </>
  );
}

function Crop({ image, rect }: { image: string; rect: Rect }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let canceled = false;
    const im = new Image();
    im.src = image;
    im.onload = () => {
      if (canceled || !canvas.current) return;
      const [x, y, w, h] = rect,
        scale = normalizedScale(im.width, im.height);
      const c = canvas.current;
      c.width = Math.ceil(w * 2);
      c.height = Math.ceil(h * 2);
      c.getContext("2d")!.drawImage(
        im,
        x * scale,
        y * scale,
        w * scale,
        h * scale,
        0,
        0,
        c.width,
        c.height,
      );
    };
    return () => {
      canceled = true;
    };
  }, [image, rect.join(",")]);
  return (
    <canvas
      className="scan-crop"
      ref={canvas}
      aria-label="Écriture manuscrite à vérifier"
    />
  );
}

function Review({
  page,
  image,
  disabled,
  mutate,
  onChanged,
}: {
  page: ScanPage;
  image: string;
  disabled: boolean;
  mutate: (method: string, args?: object) => Promise<Session>;
  onChanged: (value: boolean) => void;
}) {
  const { session, notify, dirty, confirm } = useApp(),
    t = session.tournament;
  const form = t.paperForms?.find((f) => f.id === page.formId);
  const [values, setValues] = useState<Record<string, ScanValue>>(page.values),
    [changed, setChanged] = useState(false),
    [saving, setSaving] = useState(false),
    [association, setAssociation] = useState("");
  const key = `scan-review-${page.id}`;
  useEffect(() => {
    dirty(key, changed);
    onChanged(changed);
    return () => {
      dirty(key, false);
      onChanged(false);
    };
  }, [changed]);
  let stale = "";
  if (form)
    try {
      currentForm(t, form.id);
    } catch (e) {
      stale = (e as Error).message;
    }
  const readOnly = page.status !== "pending" || disabled || saving;
  const change = (key: string, value: string) => {
    setValues((v) => ({ ...v, [key]: { value } }));
    setChanged(true);
  };
  const run = async (fn: () => Promise<void>) => {
    setSaving(true);
    try {
      await fn();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setSaving(false);
    }
  };
  const fields = (f: PaperForm) =>
    f.fields.map((field) => {
      const value =
        page.accepted?.[field.key] ?? values[field.key]?.value ?? "";
      return (
        <label className="scan-field" key={field.key}>
          {field.matchId
            ? field.label
            : field.key === "teamName"
              ? "Équipe"
              : field.label
                  .replace(/name$/, "Nom")
                  .replace(/level$/, "Niveau")
                  .replace(/email$/, "E-mail")
                  .replace(/club$/, "Club")}
          {image && !page.note?.startsWith("Association manuelle") && (
            <Crop
              image={image}
              rect={
                field.digits?.length
                  ? [
                      field.digits[0][0] - 2,
                      field.digits[0][1] - 2,
                      field.digits.reduce((sum, r) => sum + r[2], 0) + 4,
                      field.digits[0][3] + 4,
                    ]
                  : localRect(f, field.rect)
              }
            />
          )}
          {field.key.endsWith(":level") ? (
            <select
              aria-label={field.label}
              value={value}
              disabled={readOnly}
              onChange={(e) => change(field.key, e.target.value)}
            >
              <option value="">—</option>
              <option>N</option>
              <option>R</option>
              <option>D</option>
              <option>U</option>
            </select>
          ) : (
            <input
              aria-label={
                field.matchId
                  ? `${t.phases.find((p) => p.id === f.phaseId)?.matches.find((m) => m.id === field.matchId)?.order} · ${field.label}`
                  : field.label
              }
              value={value}
              disabled={readOnly}
              inputMode={field.matchId ? "numeric" : "text"}
              maxLength={field.matchId ? 3 : 200}
              onChange={(e) => change(field.key, e.target.value)}
            />
          )}
          {f.kind === "scores" && values[field.key]?.value && (
            <small
              className={values[field.key].issue ? "scan-uncertain" : "muted"}
            >
              {values[field.key].confidence !== undefined &&
              values[field.key].confidence! < 0.9
                ? "Lecture incertaine · "
                : ""}
              À vérifier sur l’image
            </small>
          )}
          {values[field.key]?.issue && (
            <span className="scan-uncertain">
              {values[field.key].issue}.{" "}
              {field.matchId
                ? "Choisissez une proposition ou saisissez le score."
                : "Corrigez le texte ou laissez ce champ vide."}
            </span>
          )}
          {!!values[field.key]?.alternatives?.length &&
            page.status === "pending" && (
              <span className="scan-alternatives">
                {values[field.key].alternatives!.map((candidate) => (
                  <button
                    type="button"
                    key={candidate}
                    disabled={readOnly}
                    aria-label={`Choisir ${candidate} pour ${field.label}`}
                    onClick={() => change(field.key, candidate)}
                  >
                    {candidate}
                  </button>
                ))}
              </span>
            )}
          {f.kind === "registration" &&
            values[field.key]?.reader?.startsWith("trocr-") &&
            value && (
              <small className="muted">
                Texte proposé · à vérifier sur l’image
              </small>
            )}
        </label>
      );
    });
  return (
    <section className="panel scan-review">
      <h2>{form?.label || "Identifier la feuille"}</h2>
      {page.status === "pending" &&
        Object.values(values).some((v) => v.issue || v.value.includes("?")) && (
          <Hint>
            {
              Object.values(values).filter(
                (v) => v.issue || v.value.includes("?"),
              ).length
            }{" "}
            lecture(s) à confirmer sur cette feuille.
          </Hint>
        )}
      {page.note && <Hint>{page.note}</Hint>}
      {stale && <Hint error>{stale}</Hint>}
      {!form ? (
        <>
          <label>
            Associer à une feuille imprimée
            <select
              value={association}
              disabled={readOnly}
              onChange={(e) => setAssociation(e.target.value)}
            >
              <option value="">Choisir une feuille…</option>
              {t.paperForms
                ?.filter((f) => {
                  try {
                    currentForm(t, f.id);
                    return true;
                  } catch {
                    return false;
                  }
                })
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label} · {f.id.slice(0, 6)}
                  </option>
                ))}
            </select>
          </label>
          <button
            disabled={readOnly || !association}
            onClick={() =>
              void run(async () => {
                if (
                  await confirm(
                    "Associer cette feuille ?",
                    "Vérifiez que les équipes et les rencontres de l’image correspondent à la feuille sélectionnée.",
                    "Associer",
                  )
                )
                  await mutate("scan-associate", {
                    id: page.id,
                    formId: association,
                  });
              })
            }
          >
            Associer la feuille
          </button>
        </>
      ) : (
        <>
          {form.kind === "scores" ? (
            <div>
              {Object.entries(form.participants).map(([mid, pair]) => {
                const p = t.phases.find((p) => p.id === form.phaseId);
                const match = p?.matches.find((m) => m.id === mid),
                  pairValues = form.fields
                    .filter((f) => f.matchId === mid)
                    .sort((a, b) => a.side! - b.side!)
                    .map((f) => values[f.key]?.value || "");
                let scoreWarning = "";
                if (
                  page.status === "pending" &&
                  match &&
                  pairValues.length === 2 &&
                  pairValues.every((v) => /^\d{1,3}$/.test(v))
                )
                  try {
                    validateScore(
                      pairValues.map(Number) as [number, number],
                      match.target,
                      defaultRules,
                    );
                  } catch (error) {
                    scoreWarning = (error as Error).message;
                  }
                return (
                  <div className="scan-match" key={mid}>
                    <h3>
                      {pair
                        .map((id) =>
                          id ? p?.teamNames[id] || id : "À déterminer",
                        )
                        .join(" / ")}
                    </h3>
                    {scoreWarning && (
                      <Hint error>Score à vérifier : {scoreWarning}</Hint>
                    )}
                    <div className="scan-score-pair">
                      {fields({
                        ...form,
                        fields: form.fields.filter((f) => f.matchId === mid),
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="scan-registration-fields">
              <p className="muted">
                N : National · R : Régional · D : Départemental · U : Sans
                licence. 3 à 4 joueurs.
              </p>
              {fields(form)}
            </div>
          )}
          {page.status === "pending" && (
            <div className="actions scan-review-actions">
              <button
                disabled={readOnly || !changed}
                onClick={() =>
                  void run(async () => {
                    await mutate("scan-draft", { id: page.id, values });
                    setChanged(false);
                    notify("Brouillon enregistré.");
                  })
                }
              >
                <Save size={16} />
                Enregistrer le brouillon
              </button>
              <button
                className="primary"
                disabled={readOnly || !!stale}
                onClick={() =>
                  void run(async () => {
                    const accepted = Object.fromEntries(
                      form.fields.map((f) => [
                        f.key,
                        values[f.key]?.value || "",
                      ]),
                    );
                    await mutate("scan-approve", { id: page.id, accepted });
                    setChanged(false);
                    notify(
                      form.kind === "scores"
                        ? "Résultats validés."
                        : "Équipe enregistrée.",
                    );
                  })
                }
              >
                <Check size={16} />
                {form.kind === "scores"
                  ? "Valider les résultats"
                  : "Enregistrer l’équipe"}
              </button>
            </div>
          )}
        </>
      )}
      {page.status === "pending" && (
        <button
          className="subtle"
          disabled={readOnly}
          onClick={() =>
            void run(async () => {
              await mutate("scan-ignore", { id: page.id });
              setChanged(false);
            })
          }
        >
          Écarter cette feuille
        </button>
      )}
      {page.approvedAt && (
        <p className="muted">
          Validée le {new Date(page.approvedAt).toLocaleString("fr-CH")}
        </p>
      )}
    </section>
  );
}
