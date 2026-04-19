import { OnboardingPlan, OnboardingReceiptStatus, OnboardingRequestStatus } from "@prisma/client";
import { ManualDeliveryModal } from "@/components/onboarding/manual-delivery-modal";
import { StatusBadge } from "@/components/ui/status-badge";
import { env } from "@/server/config/env";
import {
  hasOnboardingReviewAccess,
  requireOnboardingReviewSecret
} from "@/server/auth/onboarding-review";
import { listOnboardingRequestsForReview } from "@/server/services/onboarding.service";
import { formatCurrencyFromCents } from "@/server/utils/money";
import {
  approveOnboardingReviewAction,
  loginOnboardingReviewAction,
  logoutOnboardingReviewAction,
  rejectOnboardingReviewAction
} from "./actions";

type SearchParamsInput = Promise<Record<string, string | string[] | undefined>>;

function readTextParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function getPlanLabel(plan: OnboardingPlan) {
  switch (plan) {
    case OnboardingPlan.SEMILLERO:
      return "Semillero";
    case OnboardingPlan.ACADEMIA:
      return "Academia";
    case OnboardingPlan.CLUB_PRO:
      return "Club Pro";
  }
}

function getRequestStatusMeta(status: OnboardingRequestStatus) {
  switch (status) {
    case OnboardingRequestStatus.PENDING_PAYMENT:
      return { label: "Pendiente de pago", tone: "warning" as const };
    case OnboardingRequestStatus.TELEGRAM_LINKED:
      return { label: "Telegram vinculado", tone: "neutral" as const };
    case OnboardingRequestStatus.RECEIPT_RECEIVED:
      return { label: "Comprobante recibido", tone: "warning" as const };
    case OnboardingRequestStatus.UNDER_REVIEW:
      return { label: "En revision", tone: "warning" as const };
    case OnboardingRequestStatus.APPROVED_PENDING_ACTIVATION:
      return { label: "Aprobada, falta activacion", tone: "neutral" as const };
    case OnboardingRequestStatus.ACTIVE:
      return { label: "Activa", tone: "success" as const };
    case OnboardingRequestStatus.REJECTED:
      return { label: "Rechazada", tone: "danger" as const };
    case OnboardingRequestStatus.EXPIRED:
      return { label: "Expirada", tone: "danger" as const };
    case OnboardingRequestStatus.CANCELED:
      return { label: "Cancelada", tone: "danger" as const };
  }
}

function getReceiptStatusMeta(status: OnboardingReceiptStatus) {
  switch (status) {
    case OnboardingReceiptStatus.RECEIVED:
      return { label: "Recibido", tone: "neutral" as const };
    case OnboardingReceiptStatus.UNDER_REVIEW:
      return { label: "En revision", tone: "warning" as const };
    case OnboardingReceiptStatus.APPROVED:
      return { label: "Aprobado", tone: "success" as const };
    case OnboardingReceiptStatus.REJECTED:
      return { label: "Rechazado", tone: "danger" as const };
    case OnboardingReceiptStatus.FAILED:
      return { label: "Fallido", tone: "danger" as const };
  }
}

function truncateText(value: string | null | undefined, maxLength = 220) {
  if (!value) {
    return "Sin detalle adicional.";
  }

  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

export default async function OnboardingBackofficePage(props: {
  searchParams?: SearchParamsInput;
}) {
  const params = props.searchParams ? await props.searchParams : {};
  const notice = readTextParam(params.notice);
  const error = readTextParam(params.error);
  const activationUrl = readTextParam(params.activationUrl);
  const activationPublicCode = readTextParam(params.publicCode);
  const activationDeliveryMode = readTextParam(params.deliveryMode);
  const query = readTextParam(params.q);
  const isConfigured = env.ONBOARDING_REVIEW_SECRET.length > 0;
  const hasAccess = isConfigured ? await hasOnboardingReviewAccess() : false;

  if (!isConfigured) {
    return (
      <main className="login-wrap onboarding-stage">
        <section className="login-card stack onboarding-panel activation-panel">
          <div className="stack onboarding-card-header">
            <span className="eyebrow">Backoffice onboarding</span>
            <h1 className="app-title onboarding-panel-title">Falta la clave interna para operar altas.</h1>
            <p className="muted">
              Configura <code>ONBOARDING_REVIEW_SECRET</code> para usar esta bandeja interna y
              aprobar escuelas desde la app.
            </p>
          </div>
        </section>
      </main>
    );
  }

  if (!hasAccess) {
    return (
      <main className="login-wrap onboarding-stage">
        <section className="onboarding-stage-shell onboarding-grid">
          <article className="login-card stack onboarding-brief">
            <span className="eyebrow">Backoffice onboarding</span>
            <h1 className="app-title onboarding-side-title">Aprueba escuelas sin salir del flujo real.</h1>
            <p className="muted onboarding-side-copy">
              Aqui revisas la solicitud, validas el comprobante y entregas el acceso final del portal.
            </p>

            <ol className="onboarding-brief-list">
              <li>
                <strong>Revisa la solicitud</strong>
                <span>Confirma datos, plan y contexto comercial.</span>
              </li>
              <li>
                <strong>Valida el comprobante</strong>
                <span>Comprueba archivo y monto antes de aprobar.</span>
              </li>
              <li>
                <strong>Entrega activacion</strong>
                <span>Comparte el enlace si el correo aun no esta configurado.</span>
              </li>
            </ol>
          </article>

          <form action={loginOnboardingReviewAction} className="login-card stack onboarding-form onboarding-panel">
            <div className="stack onboarding-card-header">
              <span className="eyebrow">Ingreso interno</span>
              <h2 className="app-title onboarding-panel-title">Entra a la bandeja de altas</h2>
              <p className="muted">
                Usa la clave interna de onboarding para operar revisiones y activaciones.
              </p>
            </div>

            {error ? <p className="form-feedback danger">{error}</p> : null}
            {notice ? <p className="form-feedback success">{notice}</p> : null}

            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="review-secret">Clave interna</label>
              <input id="review-secret" name="secret" type="password" autoComplete="current-password" required />
            </div>

            <button className="button button-block onboarding-primary-button" type="submit">
              Entrar a onboarding
            </button>
          </form>
        </section>
      </main>
    );
  }

  const reviewSecret = await requireOnboardingReviewSecret();
  const allRequests = await listOnboardingRequestsForReview(reviewSecret);
  const normalizedQuery = normalizeText(query);
  const requests = normalizedQuery
    ? allRequests.filter((request) =>
        [
          request.publicCode,
          request.academyName,
          request.fullName,
          request.email,
          request.phone,
          request.city,
          request.notes,
          request.telegramUsername,
          request.telegramChatId
        ]
          .map((value) => normalizeText(value))
          .some((value) => value.includes(normalizedQuery))
      )
    : allRequests;
  const pendingStatuses = new Set<OnboardingRequestStatus>([
    OnboardingRequestStatus.PENDING_PAYMENT,
    OnboardingRequestStatus.TELEGRAM_LINKED,
    OnboardingRequestStatus.RECEIPT_RECEIVED,
    OnboardingRequestStatus.UNDER_REVIEW
  ]);
  const blockedApprovalStatuses = new Set<OnboardingRequestStatus>([
    OnboardingRequestStatus.ACTIVE,
    OnboardingRequestStatus.REJECTED,
    OnboardingRequestStatus.CANCELED,
    OnboardingRequestStatus.EXPIRED
  ]);
  const blockedRejectionStatuses = new Set<OnboardingRequestStatus>([
    OnboardingRequestStatus.ACTIVE,
    OnboardingRequestStatus.REJECTED,
    OnboardingRequestStatus.CANCELED
  ]);
  const pendingCount = requests.filter((request) => pendingStatuses.has(request.status)).length;
  const approvedCount = requests.filter(
    (request) => request.status === OnboardingRequestStatus.APPROVED_PENDING_ACTIVATION
  ).length;
  const activeCount = requests.filter((request) => request.status === OnboardingRequestStatus.ACTIVE).length;
  const closeModalParams = new URLSearchParams();

  if (query) {
    closeModalParams.set("q", query);
  }

  const modalCloseHref = closeModalParams.size > 0
    ? `/backoffice/onboarding?${closeModalParams.toString()}`
    : "/backoffice/onboarding";

  return (
    <main className="page-shell onboarding-review-shell">
      {activationUrl && activationPublicCode ? (
        <ManualDeliveryModal
          activationUrl={activationUrl}
          closeHref={modalCloseHref}
          publicCode={activationPublicCode}
          deliveryMode={activationDeliveryMode === "email" ? "email" : "manual"}
        />
      ) : null}

      <section className="stack onboarding-review-frame">
        <section className="shell-header stack">
          <div className="onboarding-review-topbar">
            <div className="stack onboarding-review-heading" style={{ gap: 6 }}>
              <span className="eyebrow">Backoffice onboarding</span>
              <h1 className="shell-title onboarding-review-title">Solicitudes de alta</h1>
            </div>

            <form className="onboarding-review-search-form" method="get">
              <label htmlFor="onboarding-search" className="onboarding-review-search-label">
                Buscar solicitud
              </label>
              <div className="onboarding-review-search-row">
                <input
                  id="onboarding-search"
                  name="q"
                  type="search"
                  defaultValue={query}
                  placeholder="Codigo, academia o director"
                />
                <button className="button-secondary button-small" type="submit">
                  Buscar
                </button>
                {query ? (
                  <a href="/backoffice/onboarding" className="button-secondary button-small">
                    Limpiar
                  </a>
                ) : null}
              </div>
            </form>

            <form action={logoutOnboardingReviewAction} className="onboarding-review-inline-exit">
              <button className="button-secondary button-small" type="submit">
                Salir
              </button>
            </form>
          </div>

          {notice ? <p className="form-feedback success">{notice}</p> : null}
          {error ? <p className="form-feedback danger">{error}</p> : null}
        </section>

        <section className="onboarding-review-grid">
          {requests.length === 0 ? (
            <article className="app-card table-empty onboarding-review-empty">
              <span className="eyebrow">Sin solicitudes</span>
              <h2 className="card-title">
                {query ? "No encontramos resultados para tu busqueda." : "Todavia no entran altas nuevas."}
              </h2>
              <p className="muted">
                {query
                  ? "Prueba con otro codigo, academia, correo o telefono."
                  : "Cuando un director complete /alta, la solicitud aparecera aqui."}
              </p>
            </article>
          ) : (
            <article className="app-card onboarding-review-table-card">
              <div className="onboarding-review-table-wrap">
                <table className="data-table data-table-compact onboarding-review-table">
                  <thead>
                    <tr>
                      <th>Solicitud</th>
                      <th>Estado</th>
                      <th>Plan</th>
                      <th>Pago</th>
                      <th>Telegram</th>
                      <th>Comprobante</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((request) => {
                      const requestStatus = getRequestStatusMeta(request.status);
                      const latestReceipt = request.receipts[0] ?? null;
                      const latestReceiptStatus = latestReceipt ? getReceiptStatusMeta(latestReceipt.status) : null;
                      const amountMismatch =
                        latestReceipt?.extractedAmountCents != null &&
                        latestReceipt.extractedAmountCents !== request.expectedAmountCents;
                      const canApprove = !!latestReceipt && !blockedApprovalStatuses.has(request.status);
                      const canReject = !blockedRejectionStatuses.has(request.status);

                      return (
                        <tr key={request.id}>
                          <td>
                            <div className="onboarding-table-cell">
                              <span className="eyebrow">{request.publicCode}</span>
                              <strong className="table-primary">{request.academyName}</strong>
                              <span className="table-secondary">{request.fullName}</span>
                              <span className="table-secondary">
                                {request.email} | {request.phone}
                              </span>
                              {request.notes ? (
                                <span className="table-secondary">{truncateText(request.notes, 120)}</span>
                              ) : null}
                            </div>
                          </td>
                          <td>
                            <div className="onboarding-table-cell compact-actions">
                              <StatusBadge label={requestStatus.label} tone={requestStatus.tone} />
                              {request.status === OnboardingRequestStatus.APPROVED_PENDING_ACTIVATION ? (
                                <span className="table-secondary">
                                  Acceso vence: {formatDateTime(request.expiresAt)}
                                </span>
                              ) : null}
                              {request.rejectionReason ? (
                                <span className="table-secondary">
                                  Motivo: {truncateText(request.rejectionReason, 80)}
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td>
                            <div className="onboarding-table-cell">
                              <strong className="table-primary">{getPlanLabel(request.plan)}</strong>
                              <span className="table-secondary">{request.city ?? "Sin ciudad"}</span>
                            </div>
                          </td>
                          <td>
                            <div className="onboarding-table-cell">
                              <strong className="table-primary compact-amount">
                                {formatCurrencyFromCents(request.expectedAmountCents)}
                              </strong>
                              <span className="table-secondary">Creada: {formatDateTime(request.createdAt)}</span>
                              <span className="table-secondary">Actualizada: {formatDateTime(request.updatedAt)}</span>
                            </div>
                          </td>
                          <td>
                            <div className="onboarding-table-cell">
                              <strong className="table-primary">
                                {request.telegramUsername ? `@${request.telegramUsername}` : "Sin vincular"}
                              </strong>
                              <span className="table-secondary">{request.telegramChatId ?? "Sin chat asociado"}</span>
                            </div>
                          </td>
                          <td>
                            <div className="onboarding-table-cell compact-actions">
                              {latestReceipt ? (
                                <>
                                  <div className="onboarding-table-receipt-head">
                                    <strong className="table-primary">
                                      {latestReceipt.originalFileName ?? "Archivo sin nombre"}
                                    </strong>
                                    {latestReceiptStatus ? (
                                      <StatusBadge
                                        label={latestReceiptStatus.label}
                                        tone={latestReceiptStatus.tone}
                                      />
                                    ) : null}
                                  </div>
                                  <span className="table-secondary">
                                    Monto:{" "}
                                    {latestReceipt.extractedAmountCents != null
                                      ? formatCurrencyFromCents(latestReceipt.extractedAmountCents)
                                      : "Sin monto"}
                                  </span>
                                  <span className="table-secondary">
                                    Confianza:{" "}
                                    {latestReceipt.extractionConfidence != null
                                      ? `${Math.round(latestReceipt.extractionConfidence * 100)}%`
                                      : "No disponible"}
                                  </span>
                                  <span className="table-secondary">
                                    Recibido: {formatDateTime(latestReceipt.createdAt)}
                                  </span>
                                  {latestReceipt.storagePath ? (
                                    <a
                                      href={`/backoffice/onboarding/receipts/${latestReceipt.id}`}
                                      className="table-link"
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      Ver comprobante
                                    </a>
                                  ) : null}
                                  {amountMismatch ? (
                                    <span className="table-secondary onboarding-table-warning">
                                      El monto detectado no coincide.
                                    </span>
                                  ) : null}
                                </>
                              ) : (
                                <>
                                  <strong className="table-primary">Sin comprobante</strong>
                                  <span className="table-secondary">
                                    Aun no conviene aprobar esta escuela.
                                  </span>
                                </>
                              )}
                            </div>
                          </td>
                          <td>
                            <div className="onboarding-table-actions">
                              {canApprove ? (
                                <form action={approveOnboardingReviewAction}>
                                  <input type="hidden" name="requestId" value={request.id} />
                                  <button className="button button-small button-block" type="submit">
                                    Aprobar
                                  </button>
                                </form>
                              ) : (
                                <span className="onboarding-table-muted-action">
                                  {request.status === OnboardingRequestStatus.ACTIVE
                                    ? "Portal activo"
                                    : request.status === OnboardingRequestStatus.APPROVED_PENDING_ACTIVATION
                                      ? "Esperando activacion final"
                                      : request.status === OnboardingRequestStatus.REJECTED
                                        ? "Solicitud rechazada"
                                        : "Sin aprobacion disponible"}
                                </span>
                              )}

                              {canReject ? (
                                <form action={rejectOnboardingReviewAction} className="onboarding-inline-reject">
                                  <input type="hidden" name="requestId" value={request.id} />
                                  <input
                                    id={`reject-${request.id}`}
                                    name="reason"
                                    placeholder="Motivo"
                                    required
                                  />
                                  <button className="button-secondary button-small button-block" type="submit">
                                    Rechazar
                                  </button>
                                </form>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </article>
          )}
        </section>
      </section>
    </main>
  );
}
