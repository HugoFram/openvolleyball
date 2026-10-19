import type { RankingPlan } from "../domain/engine";
export function choicesComplete(
  plan: RankingPlan | undefined | null,
  decisions: Record<string, string[]>,
) {
  return !plan?.ties.some((tie) => {
    const order = decisions[tie.key] || [];
    return (
      order.length !== tie.rows.length ||
      new Set(order).size !== order.length ||
      order.some((id) => !tie.rows.some((r) => r.teamId === id))
    );
  });
}
export function RankingChoices({
  plan,
  names,
  decisions,
  onChange,
}: {
  plan: RankingPlan;
  names: Record<string, string>;
  decisions: Record<string, string[]>;
  onChange: (d: Record<string, string[]>) => void;
}) {
  return (
    <>
      {plan.ties.map((tie) => (
        <section className="tie-panel" key={tie.key}>
          <h3>Départager les équipes</h3>
          <p>{tie.reason}</p>
          <p className="muted">
            {tie.rows
              .map(
                (r) =>
                  `${names[r.teamId]} : ${r.wins}/${r.played} victoires, ${(r.diff / Math.max(1, r.played)).toFixed(3)} diff. / match`,
              )
              .join(" · ")}
          </p>
          <div className="tie-selectors">
            {tie.rows.map((_, i) => (
              <label key={i}>
                {i + 1}
                <select
                  aria-label={`Égalité rang ${i + 1}`}
                  value={decisions[tie.key]?.[i] || ""}
                  onChange={(e) => {
                    const order = [
                      ...(decisions[tie.key] ||
                        Array(tie.rows.length).fill("")),
                    ];
                    order[i] = e.target.value;
                    onChange({ ...decisions, [tie.key]: order });
                  }}
                >
                  <option value="">Choisir une équipe</option>
                  {tie.rows.map((r) => (
                    <option key={r.teamId} value={r.teamId}>
                      {names[r.teamId]}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
