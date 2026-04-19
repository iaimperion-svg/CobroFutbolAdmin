type KpiTone = "default" | "success" | "warning";
type KpiVariant = "primary" | "secondary";

export function KpiCard(props: {
  label: string;
  value: string;
  tone?: KpiTone;
  variant?: KpiVariant;
  context?: string;
}) {
  const tone = props.tone ?? "default";
  const variant = props.variant ?? "secondary";
  const caption =
    props.context ??
    (tone === "success"
      ? "Buen avance"
      : tone === "warning"
        ? "Necesita atencion"
        : "Resumen inmediato");

  return (
    <article className={`metric-card simple-kpi tone-${tone} variant-${variant}`}>
      <div className="metric-card-top">
        <div>
          <div className="metric-label">{props.label}</div>
          <div className="metric-value">{props.value}</div>
          <div className="metric-caption">{caption}</div>
        </div>
      </div>
    </article>
  );
}
