import { ChargeStatus, PaymentStatus, PlatformInvoiceStatus, SchoolStatus } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { logoutOnboardingReviewAction } from "@/app/backoffice/onboarding/actions";
import {
  ensurePlatformInvoiceAction,
  recordPlatformPaymentAction
} from "@/app/backoffice/maestro/actions";
import { requireOnboardingReviewAccess } from "@/server/auth/onboarding-review";
import {
  getBackofficeMasterSchoolDetail,
  getOnboardingPlanLabel,
  getOnboardingStatusLabel,
  getPlatformInvoiceStatusLabel,
  getReceiptStatusLabel
} from "@/server/services/backoffice-master.service";
import { formatCurrencyFromCents } from "@/server/utils/money";

export const dynamic = "force-dynamic";

type ParamsInput = Promise<{ school: string }>;
type SearchParamsInput = Promise<Record<string, string | string[] | undefined>>;
type Tone = "success" | "warning" | "danger" | "neutral";

function readTextParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function formatDateTime(value: Date | null | undefined) {
  if (!value) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(value);
}

function formatDateInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildToneClass(tone: Tone) {
  switch (tone) {
    case "success":
      return "is-success";
    case "warning":
      return "is-warning";
    case "danger":
      return "is-danger";
    case "neutral":
    default:
      return "is-neutral";
  }
}

function getSchoolStatusLabel(status: SchoolStatus) {
  switch (status) {
    case SchoolStatus.ACTIVE:
      return "Activa";
    case SchoolStatus.INACTIVE:
      return "Inactiva";
  }
}

function getPaymentStatusLabel(status: PaymentStatus) {
  switch (status) {
    case PaymentStatus.RECEIVED:
      return "Recibido";
    case PaymentStatus.RECONCILED:
      return "Conciliado";
    case PaymentStatus.REJECTED:
      return "Rechazado";
    case PaymentStatus.FLAGGED:
      return "Observado";
  }
}

function getChargeStatusLabel(status: ChargeStatus) {
  switch (status) {
    case ChargeStatus.PENDING:
      return "Pendiente";
    case ChargeStatus.PARTIALLY_PAID:
      return "Parcial";
    case ChargeStatus.PAID:
      return "Pagada";
    case ChargeStatus.OVERDUE:
      return "Vencida";
    case ChargeStatus.CANCELED:
      return "Cancelada";
  }
}

function getChargeTone(status: ChargeStatus): Tone {
  switch (status) {
    case ChargeStatus.PAID:
      return "success";
    case ChargeStatus.OVERDUE:
      return "danger";
    case ChargeStatus.PARTIALLY_PAID:
      return "warning";
    case ChargeStatus.PENDING:
    case ChargeStatus.CANCELED:
    default:
      return "neutral";
  }
}

function getPlatformTone(status: PlatformInvoiceStatus): Tone {
  switch (status) {
    case PlatformInvoiceStatus.PAID:
      return "success";
    case PlatformInvoiceStatus.OVERDUE:
      return "danger";
    case PlatformInvoiceStatus.PENDING:
    case PlatformInvoiceStatus.PARTIALLY_PAID:
      return "warning";
    case PlatformInvoiceStatus.CANCELED:
    default:
      return "neutral";
  }
}

export default async function BackofficeMasterSchoolPage(props: {
  params: ParamsInput;
  searchParams?: SearchParamsInput;
}) {
  await requireOnboardingReviewAccess();

  const params = await props.params;
  const searchParams = props.searchParams ? await props.searchParams : {};
  const notice = readTextParam(searchParams.notice);
  const error = readTextParam(searchParams.error);
  const detail = await getBackofficeMasterSchoolDetail(params.school);

  if (!detail) {
    notFound();
  }

  const { school, metrics } = detail;
  const onboardingHref = `/backoffice/onboarding?q=${encodeURIComponent(
    school.latestOnboarding?.publicCode ?? school.name
  )}`;
  const currentCollectionRate =
    metrics.currentBilledCents === 0
      ? 0
      : Math.round((metrics.currentCollectedCents / metrics.currentBilledCents) * 100);
  const defaultPlatformAmount = Math.max(
    Math.round((school.currentPlatformInvoice?.outstandingCents ?? metrics.platformCurrentExpectedCents) / 100),
    0
  );
  const currentInvoiceStatus = school.currentPlatformInvoice
    ? getPlatformInvoiceStatusLabel(school.currentPlatformInvoice.status)
    : school.platformBillingActive
      ? "Sin emitir"
      : "Sin plan activo";
  const currentInvoiceTone = school.currentPlatformInvoice
    ? getPlatformTone(school.currentPlatformInvoice.status)
    : school.platformBillingActive
      ? "warning"
      : "neutral";
  const primaryStats = [
    {
      label: "Estado",
      value: school.healthLabel,
      note: `${getSchoolStatusLabel(school.status)} | ${school.setupComplete ? "lista" : "pendiente"}`,
      tone: school.healthTone
    },
    {
      label: `Alumnos ${detail.currentPeriodLabel}`,
      value: formatCurrencyFromCents(metrics.currentOutstandingCents),
      note: `${metrics.currentStudentsPaid} ok | ${metrics.currentStudentsWithDebt} por pagar`,
      tone: metrics.currentOutstandingCents > 0 ? "warning" as const : "success" as const
    },
    {
      label: "Pago CF",
      value: formatCurrencyFromCents(metrics.platformCurrentOutstandingCents),
      note: currentInvoiceStatus,
      tone: currentInvoiceTone
    },
    {
      label: "Alertas",
      value: String(school.openReviews),
      note: `${metrics.unreconciledPayments} pagos pendientes`,
      tone: school.openReviews > 0 ? "danger" as const : "success" as const
    }
  ];

  return (
    <main className="cf-master cf-master-detail cf-master-silver">
      <aside className="cf-master-sidebar" aria-label="Menu detalle escuela">
        <div className="cf-master-brand">
          <img src="/brand/logo_.png" alt="CobroFutbol" className="cf-master-logo" />
          <strong>{school.name}</strong>
          <small>Cliente</small>
        </div>

        <nav className="cf-master-menu">
          <a href="/backoffice/maestro"><span>RS</span><strong>Resumen</strong></a>
          <a href="/backoffice/maestro/clientes" className="is-active"><span>CL</span><strong>Clientes</strong></a>
          <a href="/backoffice/maestro/ingresos"><span>IN</span><strong>Ingresos</strong></a>
          <a href="/backoffice/onboarding"><span>ON</span><strong>Onboarding</strong></a>
          <a href="/backoffice/maestro/mantenedores/pagos"><span>$</span><strong>Pagos CF</strong></a>
          <a href="/backoffice/maestro/mantenedores/alertas"><span>AL</span><strong>Alertas</strong></a>
        </nav>

        <div className="cf-master-sidebar-footer">
          <div className="cf-master-sidebar-note">
            <strong>Detalle</strong>
            <a href="#estado">Estado</a>
            <a href="#cobro-cf">Pagos CF</a>
            <a href="#operacion">Datos</a>
            <a href="#actividad">Actividad</a>
            <a href={onboardingHref}>Ingreso</a>
          </div>
          <form action={logoutOnboardingReviewAction} className="cf-master-sidebar-action cf-master-logout-action">
            <span>Sesion</span>
            <button type="submit">Cerrar sesion</button>
          </form>
        </div>
      </aside>

      <section className="cf-master-main">
        <header className="cf-master-hero cf-detail-hero" id="estado">
          <div>
            <span className="cf-master-kicker">Detalle escuela</span>
            <h1>{school.name}</h1>
            <p>
              Resumen simple del cliente, sus pagos y actividad.
            </p>
            <div className="cf-detail-meta">
              <span className={`cf-master-pill ${buildToneClass(school.healthTone)}`}>{school.healthLabel}</span>
              <span>slug: {school.slug}</span>
              <span>{getSchoolStatusLabel(school.status)}</span>
            </div>
          </div>

          <div className="cf-detail-actions">
            <Link href="/backoffice/maestro">Volver</Link>
            <a href={onboardingHref}>Ingreso</a>
            <Link href="/app/receipts">Recibos</Link>
            <a href={`/app/reviews/monthly?period=${detail.currentPeriodLabel}`}>Este mes</a>
          </div>
        </header>

        {error ? <div className="cf-master-alert is-danger"><strong>{error}</strong></div> : null}
        {notice ? <div className="cf-master-alert is-success"><strong>{notice}</strong></div> : null}

        <section className="cf-master-status-grid" aria-label="Resumen escuela">
          {primaryStats.map((item) => (
            <article key={item.label} className={`cf-master-status-card ${buildToneClass(item.tone)}`}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.note}</small>
            </article>
          ))}
        </section>

        <section className="cf-master-split" id="cobro-cf">
          <article className="cf-master-panel">
            <div className="cf-master-section-head">
              <div>
                <span className="cf-master-kicker">Pagos CF</span>
                <h2>Pago CobroFutbol</h2>
              </div>
              <p>{detail.currentPeriodLabel}</p>
            </div>

            <div className="cf-detail-kv">
              <span>Estado</span>
              <strong>{currentInvoiceStatus}</strong>
              <span>Monto</span>
              <strong>{formatCurrencyFromCents(metrics.platformCurrentExpectedCents)}</strong>
              <span>Pagado</span>
              <strong>{formatCurrencyFromCents(metrics.platformCurrentPaidCents)}</strong>
              <span>Saldo</span>
              <strong>{formatCurrencyFromCents(metrics.platformCurrentOutstandingCents)}</strong>
              <span>Vence</span>
              <strong>{formatDateTime(school.currentPlatformInvoice?.dueAt)}</strong>
            </div>

            {school.platformBillingActive ? (
              <form action={ensurePlatformInvoiceAction} className="cf-detail-form">
                <input type="hidden" name="schoolId" value={school.id} />
                <input type="hidden" name="schoolSlug" value={school.slug} />
                <input type="hidden" name="periodLabel" value={detail.currentPeriodLabel} />
                <button type="submit">
                  {school.currentPlatformInvoice ? "Actualizar cobro" : `Crear cobro ${detail.currentPeriodLabel}`}
                </button>
              </form>
            ) : (
              <div className="cf-master-empty">
                <strong>Esta escuela aun no tiene plan activo.</strong>
                <p>Cuando este activa, se podra crear el cobro.</p>
              </div>
            )}
          </article>

          <article className="cf-master-panel">
            <div className="cf-master-section-head">
              <div>
                <span className="cf-master-kicker">Registrar</span>
                <h2>Pago recibido</h2>
              </div>
              <p>Registrar pago</p>
            </div>

            {school.currentPlatformInvoice ? (
              <form action={recordPlatformPaymentAction} className="cf-detail-form">
                <input type="hidden" name="schoolId" value={school.id} />
                <input type="hidden" name="schoolSlug" value={school.slug} />
                <input type="hidden" name="invoiceId" value={school.currentPlatformInvoice.id} />

                <div className="cf-detail-fields">
                  <label>
                    <span>Monto</span>
                    <input name="amount" type="text" defaultValue={defaultPlatformAmount > 0 ? String(defaultPlatformAmount) : ""} placeholder="29990" />
                  </label>
                  <label>
                    <span>Fecha pago</span>
                    <input name="paidAt" type="date" defaultValue={formatDateInput(new Date())} />
                  </label>
                  <label>
                    <span>Comprobante</span>
                    <input name="receiptReference" type="text" placeholder="Transferencia / folio" />
                  </label>
                  <label>
                    <span>Nota</span>
                    <input name="notes" type="text" placeholder="Observacion opcional" />
                  </label>
                </div>

                <button type="submit">Guardar pago</button>
              </form>
            ) : (
              <div className="cf-master-empty">
                <strong>Primero crea el cobro.</strong>
                <p>Despues podras guardar el pago.</p>
              </div>
            )}
          </article>
        </section>

        <section className="cf-master-split" id="operacion">
          <article className="cf-master-panel">
            <div className="cf-master-section-head">
              <div>
                <span className="cf-master-kicker">Datos</span>
                <h2>Datos y alertas</h2>
              </div>
              <p>{school.attentionScore} puntos</p>
            </div>

            <div className="cf-detail-kv">
              <span>Correo operativo</span>
              <strong>{school.operationsEmail ?? "Sin correo"}</strong>
              <span>Cuenta destino</span>
              <strong>
                {school.defaultBankAccount
                  ? `${school.defaultBankAccount.bankName} | ${school.defaultBankAccount.accountType}`
                  : "Sin cuenta"}
              </strong>
              <span>Numero visible</span>
              <strong>{school.defaultBankAccount?.accountNumberMasked ?? "Sin dato"}</strong>
              <span>Setup</span>
              <strong>{school.setupComplete ? "Completo" : "Incompleto"}</strong>
            </div>

            <div className="cf-detail-lanes">
              {detail.alerts.length > 0 ? (
                detail.alerts.map((alert) => (
                  <div key={alert} className="cf-detail-lane">
                    <strong>{alert}</strong>
                  </div>
                ))
              ) : (
                <div className="cf-detail-lane">
                  <strong>Sin bloqueos relevantes ahora.</strong>
                  <span>La escuela no muestra alertas fuertes en este recorte.</span>
                </div>
              )}
            </div>
          </article>

          <article className="cf-master-panel">
            <div className="cf-master-section-head">
              <div>
                <span className="cf-master-kicker">Pagos alumnos</span>
                <h2>Este mes</h2>
              </div>
              <p>{currentCollectionRate}% cobrado</p>
            </div>

            <div className="cf-detail-kv">
              <span>Pagado</span>
              <strong>{formatCurrencyFromCents(metrics.currentCollectedCents)}</strong>
              <span>Por pagar</span>
              <strong>{formatCurrencyFromCents(metrics.currentOutstandingCents)}</strong>
              <span>Abierto</span>
              <strong>{formatCurrencyFromCents(metrics.totalOutstandingCents)}</strong>
              <span>Recibos 7 dias</span>
              <strong>{metrics.receiptsLast7Days}</strong>
            </div>
          </article>
        </section>

        <section className="cf-master-panel">
          <div className="cf-master-section-head">
            <div>
              <span className="cf-master-kicker">Alumnos</span>
              <h2>Este mes {detail.currentPeriodLabel}</h2>
            </div>
            <p>{metrics.currentStudentsPaid} ok | {metrics.currentStudentsWithDebt} por pagar</p>
          </div>

          <div className="cf-detail-students">
            {school.students.map((student) => {
              const charge = student.charges[0] ?? null;
              return (
                <article key={student.id} className="cf-detail-student-row">
                  <div>
                    <strong>{student.fullName}</strong>
                    <span>{student.notes ?? "Sin categoria"}</span>
                  </div>
                  <span className={`cf-master-pill ${student.active ? "is-success" : "is-neutral"}`}>
                    {student.active ? "Activo" : "Inactivo"}
                  </span>
                  <div>
                    <strong>{charge ? getChargeStatusLabel(charge.status) : "Sin cargo"}</strong>
                    <span>{charge ? formatCurrencyFromCents(charge.amountCents) : "No emitido"}</span>
                  </div>
                  <div>
                    <strong>{formatCurrencyFromCents(charge?.outstandingCents ?? 0)}</strong>
                    <span>Vence {formatDateTime(charge?.dueDate)}</span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="cf-master-split" id="actividad">
          <article className="cf-master-panel">
            <div className="cf-master-section-head">
              <div>
                <span className="cf-master-kicker">Actividad</span>
                <h2>Ultimos recibos</h2>
              </div>
              <p>{school.totalReceipts} total</p>
            </div>
            <div className="cf-detail-lanes">
              {school.receipts.length > 0 ? (
                school.receipts.map((receipt) => (
                  <div key={receipt.id} className="cf-detail-lane">
                    <strong>{formatCurrencyFromCents(receipt.extractedAmountCents ?? 0)}</strong>
                    <span>{getReceiptStatusLabel(receipt.status)} | {formatDateTime(receipt.receivedAt)}</span>
                    <small>{receipt.extractedSenderName ?? receipt.extractedBankName ?? "Sin remitente detectado"}</small>
                  </div>
                ))
              ) : (
                <div className="cf-detail-lane">
                  <strong>Sin comprobantes.</strong>
                  <span>Todavia no hay recibos asociados.</span>
                </div>
              )}
            </div>
          </article>

          <article className="cf-master-panel">
            <div className="cf-master-section-head">
              <div>
                <span className="cf-master-kicker">Actividad</span>
                <h2>Pagos y alertas</h2>
              </div>
              <p>{school.totalPayments} pagos | {school.openReviews} casos</p>
            </div>
            <div className="cf-detail-lanes">
              {school.payments.slice(0, 4).map((payment) => (
                <div key={payment.id} className="cf-detail-lane">
                  <strong>{formatCurrencyFromCents(payment.amountCents)}</strong>
                  <span>{getPaymentStatusLabel(payment.status)} | {formatDateTime(payment.paidAt ?? payment.createdAt)}</span>
                  <small>{payment.senderName ?? payment.bankName ?? "Sin origen detectado"}</small>
                </div>
              ))}
              {school.reviewTasks.slice(0, 4).map((review) => (
                <div key={review.id} className="cf-detail-lane">
                  <strong>{review.reason}</strong>
                  <span>Prioridad {review.priority} | {formatDateTime(review.createdAt)}</span>
                  <small>{getReceiptStatusLabel(review.receipt.status)}</small>
                </div>
              ))}
              {school.payments.length === 0 && school.reviewTasks.length === 0 ? (
                <div className="cf-detail-lane">
                  <strong>Sin actividad pendiente.</strong>
                  <span>No hay pagos ni revisiones en este recorte.</span>
                </div>
              ) : null}
            </div>
          </article>
        </section>

        <section className="cf-master-split">
          <article className="cf-master-panel">
            <div className="cf-master-section-head">
              <div>
                <span className="cf-master-kicker">Pagos CF</span>
                <h2>Historial CF</h2>
              </div>
              <p>{school.platformInvoices.length} facturas | {school.platformPayments.length} pagos</p>
            </div>
            <div className="cf-detail-lanes">
              {school.platformInvoices.length > 0 ? (
                school.platformInvoices.map((invoice) => (
                  <div key={invoice.id} className="cf-detail-lane">
                    <strong>{invoice.periodLabel}</strong>
                    <span>{getPlatformInvoiceStatusLabel(invoice.status)} | vence {formatDateTime(invoice.dueAt)}</span>
                    <small>
                      Facturado {formatCurrencyFromCents(invoice.expectedAmountCents)} | saldo {formatCurrencyFromCents(invoice.outstandingCents)}
                    </small>
                  </div>
                ))
              ) : (
                <div className="cf-detail-lane">
                  <strong>Sin cobros CobroFutbol.</strong>
                  <span>Cuando creemos cobros apareceran aqui.</span>
                </div>
              )}
            </div>
          </article>

          <article className="cf-master-panel">
            <div className="cf-master-section-head">
              <div>
                <span className="cf-master-kicker">Ingreso</span>
                <h2>Historial ingreso</h2>
              </div>
              <p>{school.latestOnboarding ? getOnboardingPlanLabel(school.latestOnboarding.plan) : "Sin plan"}</p>
            </div>
            <div className="cf-detail-lanes">
              {school.onboardingRequests.length > 0 ? (
                school.onboardingRequests.map((request) => (
                  <a
                    key={`${request.publicCode}-${request.createdAt.toISOString()}`}
                    href={`/backoffice/onboarding?q=${encodeURIComponent(request.publicCode)}`}
                    className="cf-detail-lane"
                  >
                    <strong>{request.publicCode}</strong>
                    <span>{getOnboardingStatusLabel(request.status)}</span>
                    <small>{formatDateTime(request.createdAt)}</small>
                  </a>
                ))
              ) : (
                <div className="cf-detail-lane">
                  <strong>Sin ingreso ligado.</strong>
                  <span>No hay ingreso visible.</span>
                </div>
              )}
            </div>
          </article>
        </section>
      </section>
    </main>
  );
}
