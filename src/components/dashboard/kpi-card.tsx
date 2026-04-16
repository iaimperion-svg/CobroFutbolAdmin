type KpiTone = "default" | "success" | "warning";
type KpiVariant = "primary" | "secondary";

function KpiIcon(props: { tone: KpiTone }) {
  if (props.tone === "success") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12.5 9.2 17 19 7.5" />
      </svg>
    );
  }

  if (props.tone === "warning") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 7.5v5.5M12 17h.01M10 4.8 3.8 18.2a1.1 1.1 0 0 0 1 1.6h14.4a1.1 1.1 0 0 0 1-1.6L14 4.8a1.1 1.1 0 0 0-2 0Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 16.5 9.5 12l3 2.5 6.5-7" />
      <path d="M5 6.5h4M5 10.5h2" />
    </svg>
  );
}

export function KpiCard(props: {
  label: string;
  value: string;
  tone?: KpiTone;
  variant?: KpiVariant;
  context?: string;
}) {
  const tone = props.tone ?? "default";
  const variant = props.variant ?? "secondary";
  const badgeCopy =
    tone === "success" ? "Pagado" : tone === "warning" ? "Seguimiento" : "Operativo";
  const caption =
    props.context ??
    (tone === "success"
      ? "Ritmo de caja consolidado"
      : tone === "warning"
        ? "Zona de control pendiente"
        : "Lectura operativa inmediata");

  return (
    <article className={`metric-card tone-${tone} variant-${variant}`}>
      <div className="metric-card-top">
        <div>
          <div className="metric-label">{props.label}</div>
          <div className="metric-caption">{caption}</div>
        </div>
        <span className={`metric-icon tone-${tone}`} aria-hidden="true">
          <KpiIcon tone={tone} />
        </span>
      </div>
      <div className="metric-value">{props.value}</div>
      <div className="metric-footer">
        <span className={`pill ${tone === "default" ? "neutral" : tone}`}>{badgeCopy}</span>
      </div>
    </article>
  );
}
