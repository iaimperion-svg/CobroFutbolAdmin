import { EmptyState } from "@/components/ui/empty-state";
import {
  StatusBadge,
  getConfidenceMeta,
  getPriorityMeta,
  getReviewStatusMeta
} from "@/components/ui/status-badge";
import { requireSession } from "@/server/auth/session";
import { listReviewTasks } from "@/server/services/manual-review.service";
import { formatCurrencyFromCents } from "@/server/utils/money";

type SearchParamsInput = Promise<Record<string, string | string[] | undefined>>;

function readTextParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function buildReviewsHref(
  params: Record<string, string | string[] | undefined>,
  overrides: Record<string, string | null>
) {
  const next = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value.trim().length > 0) {
      next.set(key, value);
    }
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (!value) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
  }

  const query = next.toString();
  return query.length > 0 ? `/app/reviews?${query}` : "/app/reviews";
}

function buildReviewDetailHref(
  params: Record<string, string | string[] | undefined>,
  receiptId: string
) {
  const returnTo = buildReviewsHref(params, {});
  const query = new URLSearchParams({ from: returnTo });
  return `/app/receipts/${receiptId}?${query.toString()}`;
}

function truncateText(value: string | null | undefined, maxLength = 72) {
  if (!value) {
    return "Sin detalle";
  }

  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function formatDateTime(value: Date | string) {
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function getChannelLabel(channel: string) {
  switch (channel) {
    case "TELEGRAM":
      return "Telegram";
    case "WHATSAPP":
      return "WhatsApp";
    case "EMAIL":
      return "Email";
    default:
      return "Interno";
  }
}

function getCategoryLabel(notes: string | null | undefined) {
  const normalized = (notes ?? "").trim();

  if (!normalized) {
    return "Sin categoría";
  }

  return normalized
    .replace(/^categoria\s+/i, "")
    .trim()
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getReviewStatusLabel(status: string) {
  switch (status) {
    case "OPEN":
    case "IN_PROGRESS":
      return "En revisión";
    case "RESOLVED":
      return "Resuelta";
    default:
      return status.replaceAll("_", " ").toLowerCase();
  }
}

export default async function ReviewsPage(props: { searchParams?: SearchParamsInput }) {
  const session = await requireSession();
  const reviews = await listReviewTasks(session.schoolId);
  const params = props.searchParams ? await props.searchParams : {};
  const query = readTextParam(params.q).toLowerCase();
  const priorityFilter = readTextParam(params.priority);
  const statusFilter = readTextParam(params.status);

  const filteredReviews = reviews.filter((review) => {
    const matchesQuery =
      query.length === 0 ||
      (review.receipt.originalFileName ?? "").toLowerCase().includes(query) ||
      review.reason.toLowerCase().includes(query) ||
      review.receipt.candidateMatches.some((candidate) =>
        (candidate.student?.fullName ?? "").toLowerCase().includes(query)
      );
    const matchesPriority =
      priorityFilter === "" ||
      (priorityFilter === "alta" && review.priority <= 1) ||
      (priorityFilter === "seguimiento" && review.priority === 2);
    const matchesStatus = statusFilter === "" || review.status === statusFilter;

    return matchesQuery && matchesPriority && matchesStatus;
  });

  const reviewsWithSuggestions = reviews.filter(
    (review) => review.receipt.candidateMatches.length > 0
  ).length;
  const highPriorityCount = reviews.filter((review) => review.priority === 1).length;
  const withoutSuggestionCount = reviews.filter(
    (review) => review.receipt.candidateMatches.length === 0
  ).length;

  return (
    <section className="stack reviews-screen">
      <div className="quick-filters review-mode-switch" aria-label="Vistas de cobranza">
        <a className="quick-filter active" href="/app/reviews">
          Revisión de pago
        </a>
        <a className="quick-filter" href="/app/reviews/monthly">
          Cobro mensual
        </a>
      </div>

      <section className="reviews-header">
        <div className="reviews-header-copy">
          <span className="eyebrow">Revisión de pago</span>
          <h1 className="reviews-title">Casos que requieren decisión manual</h1>
          <p className="reviews-subtitle">
            Bandeja táctica para resolver los casos que el sistema no pudo cerrar solo.
          </p>
        </div>

        <div className="reviews-kpi-strip">
          <article className="reviews-kpi-card">
            <span className="reviews-kpi-label">Pendientes</span>
            <strong className="reviews-kpi-value">{reviews.length}</strong>
            <p className="reviews-kpi-note">Casos esperando decisión humana.</p>
          </article>
          <article className="reviews-kpi-card">
            <span className="reviews-kpi-label">Prioridad alta</span>
            <strong className="reviews-kpi-value">{highPriorityCount}</strong>
            <p className="reviews-kpi-note">Casos que conviene resolver primero.</p>
          </article>
          <article className="reviews-kpi-card">
            <span className="reviews-kpi-label">Con sugerencia</span>
            <strong className="reviews-kpi-value">{reviewsWithSuggestions}</strong>
            <p className="reviews-kpi-note">El sistema ya propone una salida inicial.</p>
          </article>
          <article className="reviews-kpi-card">
            <span className="reviews-kpi-label">Sin sugerencia</span>
            <strong className="reviews-kpi-value">{withoutSuggestionCount}</strong>
            <p className="reviews-kpi-note">Requieren criterio manual completo.</p>
          </article>
        </div>
      </section>

      <form className="toolbar" method="get">
        <div className="toolbar-group">
          <div className="toolbar-field">
            <label htmlFor="review-query">Buscar</label>
            <input
              id="review-query"
              name="q"
              defaultValue={readTextParam(params.q)}
              className="toolbar-input"
              placeholder="Buscar por comprobante, motivo o alumno sugerido"
            />
          </div>
          <div className="toolbar-field">
            <label htmlFor="review-priority">Prioridad</label>
            <select
              id="review-priority"
              name="priority"
              defaultValue={priorityFilter}
              className="toolbar-select"
            >
              <option value="">Todas</option>
              <option value="alta">Alta</option>
              <option value="seguimiento">Seguimiento</option>
            </select>
          </div>
          <div className="toolbar-field">
            <label htmlFor="review-status">Estado</label>
            <select
              id="review-status"
              name="status"
              defaultValue={statusFilter}
              className="toolbar-select"
            >
              <option value="">Todos</option>
              <option value="OPEN">Abiertos</option>
              <option value="IN_PROGRESS">En revisión</option>
              <option value="RESOLVED">Resuelta</option>
            </select>
          </div>
        </div>
        <div className="toolbar-actions">
          <button className="button button-small" type="submit">
            Aplicar filtros
          </button>
          <a className="button-secondary button-small" href="/app/reviews">
            Limpiar
          </a>
        </div>
      </form>

      <article className="data-panel">
        <div className="data-panel-header">
          <span className="eyebrow">Casos abiertos</span>
          <h2 className="card-title">Bandeja operativa</h2>
          <p className="toolbar-note">
            {filteredReviews.length} visibles | motivo, sugerencia y acción por caso.
          </p>
        </div>

        {filteredReviews.length === 0 ? (
          <div className="table-empty">
            <EmptyState
              title="No hay revisiones para mostrar"
              description="Ajusta los filtros o vuelve más tarde si el sistema aún está conciliando los comprobantes."
              actionHref="/app/reviews"
              actionLabel="Ver toda la bandeja"
            />
          </div>
        ) : (
          <>
            <div className="reviews-mobile-list">
              {filteredReviews.map((review) => {
                const priorityMeta = getPriorityMeta(review.priority);
                const reviewStatus = getReviewStatusMeta(review.status);
                const primaryCandidate = review.receipt.candidateMatches[0];
                const confidenceMeta = primaryCandidate
                  ? getConfidenceMeta(primaryCandidate.confidence)
                  : null;

                return (
                  <article key={`mobile-${review.id}`} className="reviews-mobile-card">
                    <div className="reviews-mobile-card-top">
                      <div className="reviews-mobile-card-copy">
                        <div className="table-primary">
                          {primaryCandidate?.student?.fullName ?? "Alumno no identificado"}
                        </div>
                        <div className="table-secondary">
                          {getCategoryLabel(primaryCandidate?.student?.notes)} |{" "}
                          {review.receipt.originalFileName ?? `Comprobante ${review.receiptId}`}
                        </div>
                      </div>
                      <div className="reviews-mobile-badges">
                        <StatusBadge label={priorityMeta.label} tone={priorityMeta.tone} />
                        <StatusBadge
                          label={getReviewStatusLabel(review.status)}
                          tone={reviewStatus.tone}
                        />
                      </div>
                    </div>

                    <div className="reviews-mobile-section">
                      <span className="reviews-mobile-label">Motivo de revisión</span>
                      <div className="reviews-mobile-reason" title={review.reason}>
                        {truncateText(review.reason, 120)}
                      </div>
                      <div className="table-secondary">
                        {review.receipt.extractedSenderName ?? "Sin remitente"} |{" "}
                        {review.receipt.extractedReference ?? "Sin referencia"}
                      </div>
                    </div>

                    <div className="reviews-mobile-grid">
                      <div className="reviews-mobile-item">
                        <span className="reviews-mobile-label">Monto</span>
                        <strong>
                          {review.receipt.extractedAmountCents
                            ? formatCurrencyFromCents(review.receipt.extractedAmountCents)
                            : "Sin monto"}
                        </strong>
                        <span className="table-secondary">
                          {review.receipt.extractedBankName ?? "Banco sin identificar"}
                        </span>
                      </div>

                      <div className="reviews-mobile-item">
                        <span className="reviews-mobile-label">Estado y contexto</span>
                        <strong>{formatDateTime(review.updatedAt)}</strong>
                        <span className="table-secondary">
                          {getChannelLabel(review.receipt.channel)}
                        </span>
                      </div>
                    </div>

                    <div className="reviews-mobile-section">
                      <span className="reviews-mobile-label">Sugerencia del sistema</span>
                      {primaryCandidate ? (
                        <div className="review-suggestion-cell reviews-mobile-suggestion">
                          <strong className={`confidence-score ${confidenceMeta?.tone ?? "neutral"}`}>
                            {Math.round(primaryCandidate.confidence * 100)}%
                          </strong>
                          <div className="review-suggestion-copy">
                            <div className="table-primary">
                              {primaryCandidate.student?.fullName ?? "Alumno no identificado"}
                            </div>
                            <div className="table-secondary">
                              {primaryCandidate.charge?.description ?? "Sin cargo sugerido"}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="review-suggestion-cell reviews-mobile-suggestion">
                          <strong className="confidence-score neutral">-</strong>
                          <div className="review-suggestion-copy">
                            <div className="table-primary">Sin sugerencia confiable</div>
                            <div className="table-secondary">Requiere criterio manual</div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="reviews-mobile-footer">
                      <div className="table-secondary">
                        {review.receipt.candidateMatches.length} sugerencia
                        {review.receipt.candidateMatches.length === 1 ? "" : "s"}
                      </div>
                      <a
                        className="table-link table-link-primary reviews-mobile-action"
                        href={buildReviewDetailHref(params, review.receiptId)}
                      >
                        Resolver caso
                      </a>
                    </div>
                  </article>
                );
              })}
            </div>

            <table className="data-table data-table-compact reviews-table">
            <thead>
              <tr>
                <th>Caso</th>
                <th>Motivo de revisión</th>
                <th>Contexto</th>
                <th>Monto</th>
                <th>Sugerencia del sistema</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {filteredReviews.map((review) => {
                const priorityMeta = getPriorityMeta(review.priority);
                const reviewStatus = getReviewStatusMeta(review.status);
                const primaryCandidate = review.receipt.candidateMatches[0];
                const confidenceMeta = primaryCandidate
                  ? getConfidenceMeta(primaryCandidate.confidence)
                  : null;

                return (
                  <tr key={review.id}>
                    <td>
                      <div className="table-primary">
                        {primaryCandidate?.student?.fullName ?? "Alumno no identificado"}
                      </div>
                      <div className="table-secondary">
                        {getCategoryLabel(primaryCandidate?.student?.notes)} |{" "}
                        {review.receipt.originalFileName ?? `Comprobante ${review.receiptId}`}
                      </div>
                    </td>
                    <td>
                      <div className="cell-subtitle">Motivo principal</div>
                      <div className="table-primary review-reason" title={review.reason}>
                        {truncateText(review.reason)}
                      </div>
                      <div className="table-secondary">
                        {review.receipt.extractedSenderName ?? "Sin remitente"} |{" "}
                        {review.receipt.extractedReference ?? "Sin referencia"}
                      </div>
                    </td>
                    <td>
                      <div className="review-context-cell">
                        <StatusBadge label={priorityMeta.label} tone={priorityMeta.tone} />
                        <StatusBadge
                          label={getReviewStatusLabel(review.status)}
                          tone={reviewStatus.tone}
                        />
                        <div className="table-secondary">
                          {formatDateTime(review.updatedAt)} | {getChannelLabel(review.receipt.channel)}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="table-primary">
                        {review.receipt.extractedAmountCents
                          ? formatCurrencyFromCents(review.receipt.extractedAmountCents)
                          : "Sin monto"}
                      </div>
                      <div className="table-secondary">
                        {review.receipt.extractedBankName ?? "Banco sin identificar"}
                      </div>
                    </td>
                    <td>
                      {primaryCandidate ? (
                        <div className="review-suggestion-cell">
                          <strong className={`confidence-score ${confidenceMeta?.tone ?? "neutral"}`}>
                            {Math.round(primaryCandidate.confidence * 100)}%
                          </strong>
                          <div className="review-suggestion-copy">
                            <div className="table-primary">
                              {primaryCandidate.student?.fullName ?? "Alumno no identificado"}
                            </div>
                            <div className="table-secondary">
                              {primaryCandidate.charge?.description ?? "Sin cargo sugerido"}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="review-suggestion-cell">
                          <strong className="confidence-score neutral">-</strong>
                          <div className="review-suggestion-copy">
                            <div className="table-primary">Sin sugerencia confiable</div>
                            <div className="table-secondary">Requiere criterio manual</div>
                          </div>
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="compact-actions review-actions">
                        <a
                          className="table-link table-link-primary"
                          href={buildReviewDetailHref(params, review.receiptId)}
                        >
                          Resolver caso
                        </a>
                        <div className="table-secondary">
                          {review.receipt.candidateMatches.length} sugerencia
                          {review.receipt.candidateMatches.length === 1 ? "" : "s"}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            </table>
          </>
        )}
      </article>
    </section>
  );
}
