import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
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

export default async function ReviewsPage(props: { searchParams?: SearchParamsInput }) {
  const session = await requireSession();
  const reviews = await listReviewTasks(session.schoolId);
  const params = props.searchParams ? await props.searchParams : {};
  const query = readTextParam(params.q).toLowerCase();
  const priorityFilter = readTextParam(params.priority);

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

    return matchesQuery && matchesPriority;
  });

  const reviewsWithSuggestions = reviews.filter(
    (review) => review.receipt.candidateMatches.length > 0
  ).length;

  return (
    <section className="stack reviews-screen">
      <div className="quick-filters review-mode-switch" aria-label="Tipos de revision">
        <a className="quick-filter active" href="/app/reviews">
          Revision manual
        </a>
        <a className="quick-filter" href="/app/reviews/monthly">
          Revision mensual
        </a>
      </div>

      <section className="app-header">
        <SectionHeader
          eyebrow="Revision manual"
          title="Bandeja tactica de validacion"
          description="Casos ambiguos, sugerencias y confirmacion final en una interfaz de control deportivo, tecnica y pensada para decisiones rapidas."
        />

        <div className="badge-row">
          <div className="stat-chip featured">
            <span className="stat-chip-label">Pendientes</span>
            <strong>{reviews.length}</strong>
            Casos esperando decision.
          </div>
          <div className="stat-chip">
            <span className="stat-chip-label">Prioridad alta</span>
            <strong>{reviews.filter((review) => review.priority === 1).length}</strong>
            Prioridad alta en seguimiento.
          </div>
        </div>
      </section>

      <section className="summary-grid">
        <article className="summary-card">
          <span className="eyebrow">Contexto operativo</span>
          <strong>Revision con foco y trazabilidad</strong>
          <p>
            Cada caso muestra lectura del OCR, sugerencias y confianza en una sola pieza visual.
          </p>
        </article>
        <article className="summary-card">
          <span className="eyebrow">Apoyo del sistema</span>
          <strong>{reviewsWithSuggestions} casos con sugerencias</strong>
          <p>
            El equipo puede confirmar rapidamente cuando el sistema ya propone alumnos o cargos.
          </p>
        </article>
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
          <h2 className="card-title">Revision compacta en tabla</h2>
          <p className="toolbar-note">Resultados visibles: {filteredReviews.length}</p>
        </div>

        {filteredReviews.length === 0 ? (
          <div className="table-empty">
            <EmptyState
              title="No hay revisiones para mostrar"
              description="Ajusta los filtros o vuelve mas tarde si el sistema aun esta conciliando los comprobantes."
              actionHref="/app/reviews"
              actionLabel="Ver toda la bandeja"
            />
          </div>
        ) : (
          <table className="data-table data-table-compact reviews-table">
            <thead>
              <tr>
                <th>Comprobante</th>
                <th>Motivo</th>
                <th>Prioridad</th>
                <th>Estado</th>
                <th>Monto</th>
                <th>Sugerencia principal</th>
                <th>Actualizado</th>
                <th>Detalle</th>
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
                        {review.receipt.originalFileName ?? `Comprobante ${review.receiptId}`}
                      </div>
                      <div className="table-secondary">
                        Ref: {review.receipt.extractedReference ?? "Sin referencia"}
                      </div>
                    </td>
                    <td>
                      <div className="table-primary" title={review.reason}>
                        {truncateText(review.reason)}
                      </div>
                      <div className="table-secondary">
                        {review.receipt.extractedSenderName ?? "Sin remitente"}
                      </div>
                    </td>
                    <td>
                      <StatusBadge label={priorityMeta.label} tone={priorityMeta.tone} />
                    </td>
                    <td>
                      <StatusBadge label={reviewStatus.label} tone={reviewStatus.tone} />
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
                        <div className="compact-confidence">
                          <strong className={`confidence-score ${confidenceMeta?.tone ?? "neutral"}`}>
                            {Math.round(primaryCandidate.confidence * 100)}%
                          </strong>
                          <div className="table-secondary">
                            {primaryCandidate.student?.fullName ?? "Alumno no identificado"}
                          </div>
                        </div>
                      ) : (
                        <div className="compact-confidence">
                          <strong className="confidence-score neutral">-</strong>
                          <div className="table-secondary">Sin sugerencia confiable</div>
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="table-primary">{formatDateTime(review.updatedAt)}</div>
                      <div className="table-secondary">
                        {review.receipt.candidateMatches.length} sugerencias
                      </div>
                    </td>
                    <td>
                      <div className="compact-actions">
                        <a
                          className="table-link"
                          href={buildReviewDetailHref(params, review.receiptId)}
                        >
                          Ver detalle
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </article>
    </section>
  );
}
