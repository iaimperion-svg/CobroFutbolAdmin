import { OnboardingPlan, OnboardingReceiptStatus, OnboardingRequestStatus } from "@prisma/client";
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
  const isConfigured = env.ONBOARDING_REVIEW_SECRET.length > 0;
  const hasAccess = isConfigured ? await hasOnboardingReviewAccess() : false;

  if (!isConfigured) {
    return (
      <main className="login-wrap">
        <section className="login-card stack" style={{ width: "min(760px, 100%)" }}>
          <span className="eyebrow">Backoffice onboarding</span>
          <h1 className="app-title">Falta la clave interna para operar altas.</h1>
          <p className="muted">
            Configura <code>ONBOARDING_REVIEW_SECRET</code> para usar esta bandeja interna y
            aprobar escuelas desde la app.
          </p>
        </section>
      </main>
    );
  }

  if (!hasAccess) {
    return (
      <main className="login-wrap">
        <section className="login-grid onboarding-grid">
          <article className="login-card stack">
            <span className="eyebrow">Backoffice onboarding</span>
            <h1 className="app-title">Aprueba escuelas sin salir del flujo real.</h1>
            <p className="muted">
              Esta bandeja interna concentra las solicitudes creadas desde <code>/alta</code>, sus
              comprobantes y la activacion final del portal.
            </p>

            <div className="badge-row">
              <div className="stat-chip">
                <strong>1.</strong>
                Ver solicitud y comprobante.
              </div>
              <div className="stat-chip">
                <strong>2.</strong>
                Aprobar o rechazar.
              </div>
              <div className="stat-chip">
                <strong>3.</strong>
                Entregar acceso si el correo aun no esta configurado.
              </div>
            </div>
          </article>

          <form action={loginOnboardingReviewAction} className="login-card stack onboarding-form">
            <div className="stack" style={{ gap: 8 }}>
              <span className="eyebrow">Ingreso interno</span>
              <h2 className="app-title" style={{ fontSize: "2rem" }}>
                Entra a la bandeja de altas
              </h2>
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

            <button className="button button-block" type="submit">
              Entrar a onboarding
            </button>
          </form>
        </section>
      </main>
    );
  }

  const reviewSecret = await requireOnboardingReviewSecret();
  const requests = await listOnboardingRequestsForReview(reviewSecret);
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
  const pendingCount = requests.filter((request) =>
    pendingStatuses.has(request.status)
  ).length;
  const approvedCount = requests.filter(
    (request) => request.status === OnboardingRequestStatus.APPROVED_PENDING_ACTIVATION
  ).length;
  const activeCount = requests.filter((request) => request.status === OnboardingRequestStatus.ACTIVE).length;

  return (
    <main className="page-shell">
      <section className="stack" style={{ maxWidth: 1240, margin: "0 auto" }}>
        <section className="shell-header stack">
          <div className="onboarding-review-toolbar">
            <div className="stack" style={{ gap: 8 }}>
              <span className="eyebrow">Backoffice onboarding</span>
              <h1 className="app-title">Bandeja real para alta de escuelas</h1>
              <p className="section-description compact">
                Solicitudes creadas desde la pagina publica, comprobantes enviados por Telegram y
                activacion final del portal en un solo lugar.
              </p>
            </div>

            <form action={logoutOnboardingReviewAction}>
              <button className="button-secondary button-small" type="submit">
                Salir
              </button>
            </form>
          </div>

          <div className="summary-grid">
            <article className="summary-card">
              <span className="eyebrow">Pendientes</span>
              <strong>{pendingCount}</strong>
              <p>Solicitudes esperando validacion o comprobante.</p>
            </article>
            <article className="summary-card">
              <span className="eyebrow">Aprobadas</span>
              <strong>{approvedCount}</strong>
              <p>Escuelas creadas pero aun sin activacion final.</p>
            </article>
            <article className="summary-card">
              <span className="eyebrow">Activas</span>
              <strong>{activeCount}</strong>
              <p>Onboardings cerrados con portal habilitado.</p>
            </article>
          </div>

          {notice ? <p className="form-feedback success">{notice}</p> : null}
          {error ? <p className="form-feedback danger">{error}</p> : null}
          {activationUrl ? (
            <div className="app-card stack" style={{ padding: 18 }}>
              <span className="eyebrow">Entrega manual</span>
              <strong>El correo no estaba configurado y el acceso quedo generado.</strong>
              <p className="muted">
                Copia este enlace y compártelo al director. Vence en 1 hora desde su creacion.
              </p>
              <a href={activationUrl} className="button-secondary" target="_blank" rel="noreferrer">
                Abrir enlace de activacion
              </a>
            </div>
          ) : null}
        </section>

        <section className="onboarding-review-grid">
          {requests.length === 0 ? (
            <article className="login-card stack">
              <span className="eyebrow">Sin solicitudes</span>
              <h2 className="card-title">Todavia no entran altas nuevas.</h2>
              <p className="muted">
                Cuando un director complete <code>/alta</code>, la solicitud aparecera aqui.
              </p>
            </article>
          ) : (
            requests.map((request) => {
              const requestStatus = getRequestStatusMeta(request.status);
              const latestReceipt = request.receipts[0] ?? null;
              const latestReceiptStatus = latestReceipt ? getReceiptStatusMeta(latestReceipt.status) : null;
              const amountMismatch =
                latestReceipt?.extractedAmountCents != null &&
                latestReceipt.extractedAmountCents !== request.expectedAmountCents;
              const canApprove = !!latestReceipt && !blockedApprovalStatuses.has(request.status);
              const canReject = !blockedRejectionStatuses.has(request.status);

              return (
                <article key={request.id} className="login-card stack onboarding-review-card">
                  <div className="onboarding-review-toolbar">
                    <div className="stack" style={{ gap: 6 }}>
                      <div className="action-row">
                        <span className="eyebrow">{request.publicCode}</span>
                        <StatusBadge label={requestStatus.label} tone={requestStatus.tone} />
                      </div>
                      <h2 className="card-title">{request.academyName}</h2>
                      <p className="muted">
                        {request.fullName}
                        {" | "}
                        {request.email}
                        {" | "}
                        {request.phone}
                      </p>
                    </div>

                    <div className="stack" style={{ gap: 8, justifyItems: "end" }}>
                      <div className="stat-chip">
                        <strong>{getPlanLabel(request.plan)}</strong>
                        {request.city ?? "Ciudad no indicada"}
                      </div>
                    </div>
                  </div>

                  <div className="onboarding-code-row">
                    <div className="student-summary-card">
                      <span className="stat-chip-label">Esperado</span>
                      <strong>{formatCurrencyFromCents(request.expectedAmountCents)}</strong>
                      Pre-calentamiento de activacion.
                    </div>
                    <div className="student-summary-card">
                      <span className="stat-chip-label">Creada</span>
                      <strong>{formatDateTime(request.createdAt)}</strong>
                      Ultimo cambio: {formatDateTime(request.updatedAt)}
                    </div>
                    <div className="student-summary-card">
                      <span className="stat-chip-label">Telegram</span>
                      <strong>{request.telegramUsername ? `@${request.telegramUsername}` : "Sin vincular"}</strong>
                      {request.telegramChatId ?? "Aun no se enlaza chat"}
                    </div>
                  </div>

                  {request.notes ? (
                    <div className="app-card stack" style={{ padding: 16 }}>
                      <span className="eyebrow">Contexto comercial</span>
                      <p className="muted" style={{ margin: 0 }}>
                        {request.notes}
                      </p>
                    </div>
                  ) : null}

                  {latestReceipt ? (
                    <div className="app-card stack" style={{ padding: 18 }}>
                      <div className="onboarding-review-toolbar">
                        <div className="stack" style={{ gap: 6 }}>
                          <span className="eyebrow">Ultimo comprobante</span>
                          <div className="action-row">
                            <strong>{latestReceipt.originalFileName ?? "Archivo sin nombre"}</strong>
                            {latestReceiptStatus ? (
                              <StatusBadge
                                label={latestReceiptStatus.label}
                                tone={latestReceiptStatus.tone}
                              />
                            ) : null}
                          </div>
                        </div>

                        {latestReceipt.storagePath ? (
                          <a
                            href={`/backoffice/onboarding/receipts/${latestReceipt.id}`}
                            className="button-secondary button-small"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Ver comprobante
                          </a>
                        ) : null}
                      </div>

                      <div className="onboarding-code-row">
                        <div className="student-summary-card">
                          <span className="stat-chip-label">Monto detectado</span>
                          <strong>
                            {latestReceipt.extractedAmountCents != null
                              ? formatCurrencyFromCents(latestReceipt.extractedAmountCents)
                              : "Sin monto"}
                          </strong>
                          Confianza:{" "}
                          {latestReceipt.extractionConfidence != null
                            ? `${Math.round(latestReceipt.extractionConfidence * 100)}%`
                            : "No disponible"}
                        </div>
                        <div className="student-summary-card">
                          <span className="stat-chip-label">Recibido</span>
                          <strong>{formatDateTime(latestReceipt.createdAt)}</strong>
                          {latestReceipt.senderUsername
                            ? `Telegram: @${latestReceipt.senderUsername}`
                            : latestReceipt.senderName ?? "Sin remitente"}
                        </div>
                        <div className="student-summary-card">
                          <span className="stat-chip-label">Archivo</span>
                          <strong>{latestReceipt.mimeType ?? "Tipo no informado"}</strong>
                          {latestReceipt.storagePath ? "Disponible para revision" : "Aun no descargado"}
                        </div>
                      </div>

                      {amountMismatch ? (
                        <p className="form-feedback danger">
                          El comprobante detectado no coincide con el monto esperado de activacion.
                        </p>
                      ) : null}

                      <p className="muted" style={{ margin: 0 }}>
                        {truncateText(latestReceipt.bodyText ?? latestReceipt.extractedText)}
                      </p>
                    </div>
                  ) : (
                    <p className="form-feedback danger">
                      Aun no hay comprobante asociado. No conviene aprobar esta escuela todavia.
                    </p>
                  )}

                  {request.status === OnboardingRequestStatus.APPROVED_PENDING_ACTIVATION ? (
                    <p className="form-feedback success">
                      La escuela ya fue creada. El acceso vence el {formatDateTime(request.expiresAt)}.
                    </p>
                  ) : null}

                  {request.rejectionReason ? (
                    <p className="form-feedback danger">Motivo de rechazo: {request.rejectionReason}</p>
                  ) : null}

                  <div className="onboarding-review-actions">
                    <form action={approveOnboardingReviewAction} className="stack">
                      <input type="hidden" name="requestId" value={request.id} />
                      <button className="button" type="submit" disabled={!canApprove}>
                        Aprobar y crear portal
                      </button>
                    </form>

                    <form action={rejectOnboardingReviewAction} className="stack">
                      <input type="hidden" name="requestId" value={request.id} />
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label htmlFor={`reject-${request.id}`}>Motivo de rechazo</label>
                        <input
                          id={`reject-${request.id}`}
                          name="reason"
                          placeholder="Ejemplo: monto incompleto o comprobante ilegible"
                          required={canReject}
                          disabled={!canReject}
                        />
                      </div>
                      <button className="button-secondary" type="submit" disabled={!canReject}>
                        Rechazar solicitud
                      </button>
                    </form>
                  </div>
                </article>
              );
            })
          )}
        </section>
      </section>
    </main>
  );
}
