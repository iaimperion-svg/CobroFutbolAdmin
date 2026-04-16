import { ReceiptDrawerActions } from "@/components/receipts/receipt-drawer-actions";
import { EmptyState } from "@/components/ui/empty-state";
import {
  StatusBadge,
  getConfidenceMeta,
  getManualDecisionMeta,
  getReceiptStatusMeta,
  getReconciliationStatusMeta
} from "@/components/ui/status-badge";
import { requireSession } from "@/server/auth/session";
import { getReceiptReviewCase } from "@/server/services/manual-review.service";
import { listCharges } from "@/server/services/charges.service";
import { listReceipts } from "@/server/services/receipts.service";
import { listReconciliations } from "@/server/services/reconciliation.service";
import { listStudents } from "@/server/services/students.service";
import { formatCurrencyFromCents } from "@/server/utils/money";

type SearchParamsInput = Promise<Record<string, string | string[] | undefined>>;

function readTextParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function getConfidenceBucket(confidence: number | null | undefined) {
  if (confidence == null) return "sin-lectura";
  if (confidence >= 0.85) return "alta";
  if (confidence >= 0.7) return "media";
  return "baja";
}

function buildHref(
  params: Record<string, string | string[] | undefined>,
  overrides: Record<string, string | null>
) {
  const next = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value.trim().length > 0) next.set(key, value);
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value == null || value === "") next.delete(key);
    else next.set(key, value);
  }

  const query = next.toString();
  return query.length > 0 ? `/app/receipts?${query}` : "/app/receipts";
}

function buildReceiptDetailHref(
  params: Record<string, string | string[] | undefined>,
  receiptId: string,
  tab?: "detalle" | "conciliacion"
) {
  const returnTo = buildHref(params, { detail: null, view: null });
  const next = new URLSearchParams({ from: returnTo });

  if (tab) {
    next.set("tab", tab);
  }

  return `/app/receipts/${receiptId}?${next.toString()}`;
}

function splitRationale(rationale: string | null | undefined) {
  if (!rationale) {
    return [];
  }

  return rationale
    .split(/[.;]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);
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

function getFileKindLabel(mimeType: string | null | undefined) {
  if (mimeType?.includes("pdf")) {
    return "PDF";
  }

  if (mimeType?.startsWith("image/")) {
    return "Imagen";
  }

  return "Adjunto";
}

function getReceiptAssetUrl(receipt: {
  id: string;
  storagePath?: string | null;
  fileUrl?: string | null;
}) {
  if (receipt.storagePath) {
    return `/api/v1/receipts/${receipt.id}/file`;
  }

  if (receipt.fileUrl && !receipt.fileUrl.startsWith("telegram://")) {
    return receipt.fileUrl;
  }

  return null;
}

function getOriginSecondaryLine(receipt: {
  channel: string;
  message?: {
    externalChatId?: string | null;
    externalUserId?: string | null;
    senderUsername?: string | null;
  } | null;
}) {
  if (receipt.channel !== "TELEGRAM") {
    return "Origen interno o proveedor alterno";
  }

  const parts = [
    receipt.message?.externalChatId ? `chat ${receipt.message.externalChatId}` : null,
    receipt.message?.senderUsername ? `@${receipt.message.senderUsername}` : null,
    receipt.message?.externalUserId ? `usuario ${receipt.message.externalUserId}` : null
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : "Sin datos del chat";
}

function truncateText(value: string | null | undefined, maxLength = 96) {
  if (!value) {
    return "Sin texto o caption";
  }

  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function formatAuditAction(action: string) {
  const labelMap: Record<string, string> = {
    "receipt.automatic.reconciled": "Conciliacion automatica",
    "receipt.review.approved": "Conciliacion aprobada",
    "receipt.review.reassigned": "Comprobante reasignado",
    "receipt.review.manual_payment_confirmed": "Pago manual confirmado",
    "receipt.review.rejected": "Conciliacion rechazada",
    "receipt.review.reprocess_requested": "Reproceso solicitado",
    "receipt.review.reprocessed": "Reproceso completado",
    "receipt.review.reprocessed_and_confirmed": "Reproceso con cierre automatico",
    "receipt.review.note_added": "Observacion interna agregada",
    "receipt.manual.reconciled": "Conciliacion manual"
  };

  return labelMap[action] ?? action;
}

function ReconciliationMode(props: { mode: "auto" | "manual" | "pending" }) {
  const labels = { auto: "Automatica", manual: "Manual", pending: "Pendiente" } as const;

  return (
    <span className={`reconciliation-mode ${props.mode}`}>
      <span className="reconciliation-mode-icon" aria-hidden="true" />
      {labels[props.mode]}
    </span>
  );
}

function DrawerLabel(props: { token: string; label: string }) {
  return (
    <span className="drawer-label drawer-label-icon" title={props.label} aria-label={props.label}>
      {props.token}
    </span>
  );
}

export default async function ReceiptsPage(props: { searchParams?: SearchParamsInput }) {
  const session = await requireSession();
  const params = props.searchParams ? await props.searchParams : {};
  const query = readTextParam(params.q).toLowerCase();
  const statusFilter = readTextParam(params.status);
  const confidenceFilter = readTextParam(params.confidence);
  const quickFilter = readTextParam(params.quick);
  const detailId = readTextParam(params.detail);
  const drawerView = readTextParam(params.view);
  const [receipts, reconciliations, students, charges, selectedCase] = await Promise.all([
    listReceipts(session.schoolId),
    listReconciliations(session.schoolId),
    listStudents(session.schoolId),
    listCharges(session.schoolId),
    detailId ? getReceiptReviewCase(detailId, session.schoolId).catch(() => null) : Promise.resolve(null)
  ]);
  const filteredReceipts = receipts.filter((receipt) => {
    const bestCandidate = receipt.candidateMatches[0];
    const confidenceBucket = getConfidenceBucket(bestCandidate?.confidence);
    const matchesQuery =
      query.length === 0 ||
      (receipt.originalFileName ?? "").toLowerCase().includes(query) ||
      (receipt.message?.bodyText ?? "").toLowerCase().includes(query) ||
      (receipt.message?.externalChatId ?? "").toLowerCase().includes(query) ||
      (receipt.message?.senderUsername ?? "").toLowerCase().includes(query) ||
      (receipt.guardian?.fullName ?? "").toLowerCase().includes(query) ||
      (receipt.student?.fullName ?? "").toLowerCase().includes(query) ||
      (receipt.extractedReference ?? "").toLowerCase().includes(query) ||
      (receipt.extractedSenderName ?? "").toLowerCase().includes(query);
    const matchesStatus = statusFilter === "" || receipt.status === statusFilter;
    const matchesConfidence = confidenceFilter === "" || confidenceBucket === confidenceFilter;
    const matchesQuick =
      quickFilter === "" ||
      (quickFilter === "revision" && receipt.status === "MANUAL_REVIEW") ||
      (quickFilter === "automatico" && receipt.status === "AUTO_RECONCILED");

    return matchesQuery && matchesStatus && matchesConfidence && matchesQuick;
  });

  const filteredReconciliations = reconciliations.filter((reconciliation) => {
    return (
      query.length === 0 ||
      (reconciliation.receipt.originalFileName ?? "").toLowerCase().includes(query) ||
      (reconciliation.receipt.student?.fullName ?? "").toLowerCase().includes(query) ||
      (reconciliation.payment.senderName ?? "").toLowerCase().includes(query) ||
      (reconciliation.allocations[0]?.charge.description ?? "").toLowerCase().includes(query)
    );
  });


  const chargeOptions = charges
    .filter((charge) => charge.outstandingCents > 0 && charge.status !== "PAID" && charge.status !== "CANCELED")
    .map((charge) => ({
      id: charge.id,
      studentId: charge.studentId,
      studentName: charge.student.fullName,
      guardianId: charge.guardianId,
      guardianName: charge.guardian?.fullName ?? null,
      description: charge.description,
      periodLabel: charge.periodLabel,
      amountCents: charge.amountCents,
      outstandingCents: charge.outstandingCents,
      dueDate: charge.dueDate.toISOString()
    }));
  const studentNameById = new Map(students.map((student) => [student.id, student.fullName]));
  const selectedReceipt = selectedCase ?? filteredReceipts.find((receipt) => receipt.id === detailId) ?? null;
  const selectedIndex = filteredReceipts.findIndex((receipt) => receipt.id === selectedReceipt?.id);
  const previousReceipt = selectedIndex > 0 ? filteredReceipts[selectedIndex - 1] : null;
  const nextReceipt =
    selectedIndex >= 0 && selectedIndex < filteredReceipts.length - 1
      ? filteredReceipts[selectedIndex + 1]
      : null;
  const selectedCandidate = selectedCase?.candidateMatches[0] ?? selectedReceipt?.candidateMatches[0];
  const selectedReconciliation = selectedCase?.reconciliations[0] ?? selectedReceipt?.reconciliations[0] ?? null;
  const selectedAssetUrl = selectedReceipt ? getReceiptAssetUrl(selectedReceipt) : null;
  const selectedConfidenceMeta = selectedCandidate
    ? getConfidenceMeta(selectedCandidate.confidence)
    : null;
  const selectedStudentName =
    (selectedCandidate?.studentId ? studentNameById.get(selectedCandidate.studentId) : null) ??
    selectedReceipt?.student?.fullName ??
    "Sin sugerencia";
  const selectedConfidenceScore = selectedCandidate ? Math.round(selectedCandidate.confidence * 100) : null;

  return (
    <section className="stack receipts-screen">
      <div className={`receipts-main${selectedReceipt ? " drawer-open" : ""}`}>
        <section className="app-header receipts-header-minimal">
          <div className="receipts-heading">
            <span className="eyebrow">Comprobantes</span>
            <h1 className="receipts-title">Bandeja de comprobantes</h1>
            <p className="receipts-subtitle">
              OCR, conciliacion y decision rapida en una sola vista.
            </p>
          </div>
          <div className="receipts-inline-metrics">
            <span>{receipts.length} totales</span>
            <span>{filteredReceipts.length} visibles</span>
            <span>{filteredReconciliations.length} conciliaciones</span>
          </div>
        </section>

        <div className="receipts-ingestion-note">
          <strong>Ingreso exclusivo por Telegram.</strong>
          <span>
            Los comprobantes ya no se cargan manualmente desde esta vista. Si la cola crece,
            seguiran entrando por webhook y se procesaran en paralelo.
          </span>
        </div>

        <form className="toolbar" method="get">
          <div className="toolbar-group toolbar-group-3">
            <div className="toolbar-field">
              <label htmlFor="receipt-query">Buscar</label>
              <input
                id="receipt-query"
                name="q"
                defaultValue={readTextParam(params.q)}
                className="toolbar-input"
                placeholder="Buscar por archivo, remitente, referencia o alumno"
              />
            </div>
            <div className="toolbar-field">
              <label htmlFor="receipt-status">Estado del comprobante</label>
              <select
                id="receipt-status"
                name="status"
                defaultValue={statusFilter}
                className="toolbar-select"
              >
                <option value="">Todos</option>
                <option value="RECEIVED">Recibido</option>
                <option value="PROCESSING">Procesando</option>
                <option value="MATCHED">Conciliado por el equipo</option>
                <option value="AUTO_RECONCILED">Conciliado automaticamente</option>
                <option value="MANUAL_REVIEW">Requiere revision</option>
                <option value="REJECTED">Rechazado</option>
                <option value="FAILED">Error de procesamiento</option>
              </select>
            </div>
            <div className="toolbar-field">
              <label htmlFor="receipt-confidence">Confianza sugerida</label>
              <select
                id="receipt-confidence"
                name="confidence"
                defaultValue={confidenceFilter}
                className="toolbar-select"
              >
                <option value="">Todas</option>
                <option value="alta">Alta para conciliar</option>
                <option value="media">Media para validar</option>
                <option value="baja">Baja, revisar</option>
              </select>
            </div>
          </div>
          <div className="toolbar-actions toolbar-actions-spread">
            <div className="quick-filters">
              <a
                className={`quick-filter${quickFilter === "" ? " active" : ""}`}
                href={buildHref(params, { quick: null, detail: null, view: null })}
              >
                Todos
              </a>
              <a
                className={`quick-filter${quickFilter === "revision" ? " active" : ""}`}
                href={buildHref(params, { quick: "revision", detail: null, view: null })}
              >
                Solo requiere revision
              </a>
              <a
                className={`quick-filter${quickFilter === "automatico" ? " active" : ""}`}
                href={buildHref(params, { quick: "automatico", detail: null, view: null })}
              >
                Solo conciliado automaticamente
              </a>
            </div>
            <div className="toolbar-actions">
              <button className="button button-small" type="submit">
                Aplicar filtros
              </button>
              <a className="button-secondary button-small" href="/app/receipts">
                Limpiar
              </a>
            </div>
          </div>
        </form>


        <article className="data-panel">
          <div className="data-panel-header">
            <span className="eyebrow">Cola de comprobantes</span>
            <h2 className="card-title">Lectura operativa y decisiones rapidas</h2>
            <p className="toolbar-note">Resultados visibles: {filteredReceipts.length}</p>
          </div>
          {filteredReceipts.length === 0 ? (
            <div className="table-empty">
              <EmptyState
                title="No encontramos comprobantes con esos filtros"
                description="Prueba con otro remitente, referencia o limpia el estado para recuperar toda la cola."
                actionHref="/app/receipts"
                actionLabel="Ver toda la cola"
              />
            </div>
          ) : (
            <table className="data-table data-table-compact">
              <thead>
                <tr>
                  <th>Comprobante</th>
                  <th>Origen</th>
                  <th>Remitente</th>
                  <th>Monto</th>
                  <th>Confianza</th>
                  <th>Estado</th>
                  <th>Conciliacion</th>
                  <th>Accion</th>
                </tr>
              </thead>
              <tbody>
                {filteredReceipts.map((receipt) => {
                  const receiptMeta = getReceiptStatusMeta(receipt.status);
                  const bestCandidate = receipt.candidateMatches[0];
                  const confidenceMeta = bestCandidate
                    ? getConfidenceMeta(bestCandidate.confidence)
                    : null;
                  const bestReconciliation = receipt.reconciliations[0];
                  const decisionMeta = receipt.reviewTask?.decisionType
                    ? getManualDecisionMeta(receipt.reviewTask.decisionType)
                    : null;
                  const confidenceScore = bestCandidate
                    ? Math.round(bestCandidate.confidence * 100)
                    : null;
                  const suggestedStudentName =
                    (bestCandidate?.studentId
                      ? studentNameById.get(bestCandidate.studentId)
                      : null) ??
                    receipt.student?.fullName ??
                    "Sin sugerencia";

                  return (
                    <tr key={receipt.id}>
                      <td>
                        <div className="table-primary">{receipt.originalFileName ?? receipt.id}</div>
                        <div className="table-secondary">
                          {getFileKindLabel(receipt.mimeType)} · {suggestedStudentName}
                        </div>
                      </td>
                      <td>
                        <div className="table-primary">{getChannelLabel(receipt.channel)}</div>
                        <div className="table-secondary">{getOriginSecondaryLine(receipt)}</div>
                      </td>
                      <td>
                        <div className="table-primary">
                          {receipt.message?.senderName ??
                            receipt.extractedSenderName ??
                            "Sin remitente"}
                        </div>
                        <div className="table-secondary">
                          {receipt.message?.bodyText
                            ? truncateText(receipt.message.bodyText)
                            : receipt.guardian?.fullName ?? "Sin apoderado asociado"}
                        </div>
                      </td>
                      <td>
                        <div className="table-primary compact-amount">
                          {receipt.extractedAmountCents
                            ? formatCurrencyFromCents(receipt.extractedAmountCents)
                            : "Sin monto"}
                        </div>
                        <div className="table-secondary">
                          {receipt.extractedReference ?? "Sin referencia"}
                        </div>
                      </td>
                      <td>
                        {bestCandidate ? (
                          <div className="compact-confidence">
                            <strong className={`confidence-score ${confidenceMeta?.tone ?? "neutral"}`}>
                              {confidenceScore}%
                            </strong>
                            <StatusBadge
                              label={confidenceMeta?.label ?? "Sin lectura"}
                              tone={confidenceMeta?.tone ?? "neutral"}
                            />
                          </div>
                        ) : (
                          <div className="compact-confidence">
                            <strong className="confidence-score neutral">-</strong>
                            <StatusBadge label="Sin sugerencia" tone="neutral" />
                          </div>
                        )}
                      </td>
                      <td>
                        <StatusBadge label={receiptMeta.label} tone={receiptMeta.tone} />
                      </td>
                      <td>
                        {bestReconciliation ? (
                          <div className="compact-reconciliation">
                            <ReconciliationMode
                              mode={
                                bestReconciliation.status === "AUTO_CONFIRMED" ? "auto" : "manual"
                              }
                            />
                            <div className="table-secondary">
                              {decisionMeta?.label ?? getReconciliationStatusMeta(bestReconciliation.status).label}
                            </div>
                          </div>
                        ) : (
                          <div className="compact-reconciliation">
                            <ReconciliationMode
                              mode={receipt.status === "REJECTED" ? "manual" : "pending"}
                            />
                            <div className="table-secondary">
                              {decisionMeta?.label ?? (receipt.status === "REJECTED" ? "Rechazado" : "Pendiente")}
                            </div>
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="compact-actions">
                          <a
                            className="table-link"
                            href={buildReceiptDetailHref(params, receipt.id, "detalle")}
                          >
                            Ver detalle
                          </a>
                          {bestReconciliation ? (
                            <a
                              className="table-link"
                              href={buildReceiptDetailHref(params, receipt.id, "conciliacion")}
                            >
                              Ver conciliacion
                            </a>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </article>
      </div>

      {selectedReceipt ? (
        <>
          <a
            className="drawer-backdrop"
            href={buildHref(params, { detail: null, view: null })}
            aria-label="Cerrar detalle"
          />
          <aside className="detail-drawer" aria-label="Detalle del comprobante">
            <div className="detail-drawer-header">
              <div className="stack" style={{ gap: 6 }}>
                <span className="eyebrow">
                  {drawerView === "conciliacion" ? "Detalle de conciliacion" : "Detalle del comprobante"}
                </span>
                <h2 className="card-title">
                  {selectedReceipt.originalFileName ?? selectedReceipt.id}
                </h2>
                <p className="drawer-note">{selectedCase?.reviewTask?.reason ?? "Caso abierto."}</p>
              </div>
              <div className="drawer-header-actions">
                <div className="drawer-nav">
                  {previousReceipt ? (
                    <a
                      className="button-secondary button-small"
                      href={buildHref(params, {
                        detail: previousReceipt.id,
                        view: drawerView || "detalle"
                      })}
                      aria-label="Anterior"
                      title="Anterior"
                    >
                      {"<"}
                    </a>
                  ) : null}
                  {nextReceipt ? (
                    <a
                      className="button-secondary button-small"
                      href={buildHref(params, { detail: nextReceipt.id, view: drawerView || "detalle" })}
                      aria-label="Siguiente"
                      title="Siguiente"
                    >
                      {">"}
                    </a>
                  ) : null}
                </div>
                <a
                  className="button-secondary button-small"
                  href={buildHref(params, { detail: null, view: null })}
                  aria-label="Cerrar"
                  title="Cerrar"
                >
                  X
                </a>
              </div>
            </div>

            <div className="detail-drawer-body">
              <section className="drawer-section">
                <span className="eyebrow">Vista previa</span>
                {selectedAssetUrl && selectedReceipt.mimeType?.startsWith("image/") ? (
                  <div className="receipt-preview-card">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selectedAssetUrl}
                      alt={selectedReceipt.originalFileName ?? "Comprobante"}
                      className="receipt-preview-image"
                    />
                  </div>
                ) : selectedAssetUrl ? (
                  <div className="receipt-preview-card receipt-preview-fallback">
                    <p>Vista previa no disponible.</p>
                    <a className="table-link" href={selectedAssetUrl} target="_blank">
                      Abrir archivo
                    </a>
                  </div>
                ) : (
                  <div className="receipt-preview-card receipt-preview-fallback">
                    <p>Sin vista previa para este comprobante.</p>
                  </div>
                )}
              </section>

              <section className="drawer-section">
                <span className="eyebrow">Origen</span>
                <div className="drawer-grid drawer-grid-compact">
                  <div className="drawer-item">
                    <DrawerLabel token="CH" label="Canal" />
                    <strong>{getChannelLabel(selectedReceipt.channel)}</strong>
                  </div>
                  <div className="drawer-item">
                    <DrawerLabel token="ID" label="Chat" />
                    <strong>{selectedReceipt.message?.externalChatId ?? "Sin chat"}</strong>
                  </div>
                  <div className="drawer-item">
                    <DrawerLabel token="TM" label="Fecha original" />
                    <strong>
                      {selectedReceipt.message?.sentAt
                        ? formatDateTime(selectedReceipt.message.sentAt)
                        : formatDateTime(selectedReceipt.receivedAt)}
                    </strong>
                  </div>
                  {selectedReceipt.message?.senderUsername ? (
                    <div className="drawer-item">
                      <DrawerLabel token="US" label="Usuario Telegram" />
                      <strong>{`@${selectedReceipt.message.senderUsername}`}</strong>
                    </div>
                  ) : null}
                  <div className="drawer-item drawer-item-wide">
                    <DrawerLabel token="FI" label="Adjunto" />
                    <div className="drawer-inline-meta drawer-inline-meta-stack">
                      <strong>{selectedReceipt.originalFileName ?? "Sin archivo asociado"}</strong>
                      <div className="drawer-inline-meta">
                        <StatusBadge label={getFileKindLabel(selectedReceipt.mimeType)} tone="neutral" />
                        {selectedAssetUrl ? (
                          <a className="table-link" href={selectedAssetUrl} target="_blank">
                            Abrir archivo
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  {selectedReceipt.message?.bodyText ? (
                    <div className="drawer-item drawer-item-wide">
                      <DrawerLabel token="TX" label="Texto o caption" />
                      <div className="drawer-copy-block compact">
                        <p>{truncateText(selectedReceipt.message.bodyText, 180)}</p>
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="drawer-section">
                <span className="eyebrow">Resumen</span>
                <div className="drawer-grid drawer-grid-compact">
                  <div className="drawer-item">
                    <DrawerLabel token="RM" label="Remitente" />
                    <strong>
                      {selectedReceipt.message?.senderName ??
                        selectedReceipt.extractedSenderName ??
                        "Sin remitente"}
                    </strong>
                  </div>
                  <div className="drawer-item">
                    <DrawerLabel token="AL" label="Alumno sugerido" />
                    <strong>{selectedStudentName}</strong>
                  </div>
                  <div className="drawer-item">
                    <DrawerLabel token="$" label="Monto" />
                    <strong>
                      {selectedReceipt.extractedAmountCents
                        ? formatCurrencyFromCents(selectedReceipt.extractedAmountCents)
                        : "Sin monto"}
                    </strong>
                  </div>
                  <div className="drawer-item">
                    <DrawerLabel token="RF" label="Referencia" />
                    <strong>{selectedReceipt.extractedReference ?? "Sin referencia"}</strong>
                  </div>
                  <div className="drawer-item">
                    <DrawerLabel token="SC" label="Evaluacion" />
                    <div className="drawer-inline-meta">
                      <strong>
                        {selectedConfidenceScore != null
                          ? `${selectedConfidenceScore}%`
                          : "Sin lectura"}
                      </strong>
                      {selectedConfidenceMeta ? (
                        <StatusBadge
                          label={selectedConfidenceMeta.label}
                          tone={selectedConfidenceMeta.tone}
                        />
                      ) : (
                        <StatusBadge label="Sin sugerencia" tone="neutral" />
                      )}
                    </div>
                  </div>
                  <div className="drawer-item">
                    <DrawerLabel token="ST" label="Estado y conciliacion" />
                    <div className="drawer-inline-meta drawer-inline-meta-stack">
                      <StatusBadge
                        label={getReceiptStatusMeta(selectedReceipt.status).label}
                        tone={getReceiptStatusMeta(selectedReceipt.status).tone}
                      />
                      {selectedCase?.reviewTask?.decisionType ? (
                        <StatusBadge
                          label={getManualDecisionMeta(selectedCase.reviewTask.decisionType).label}
                          tone={getManualDecisionMeta(selectedCase.reviewTask.decisionType).tone}
                        />
                      ) : null}
                      {selectedReconciliation ? (
                        <>
                          <StatusBadge
                            label={getReconciliationStatusMeta(selectedReconciliation.status).label}
                            tone={getReconciliationStatusMeta(selectedReconciliation.status).tone}
                          />
                          <ReconciliationMode
                            mode={
                              selectedReconciliation.status === "AUTO_CONFIRMED" ? "auto" : "manual"
                            }
                          />
                        </>
                      ) : (
                        <ReconciliationMode mode="pending" />
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <section className="drawer-section">
                <span className="eyebrow">Razones del matching</span>
                {splitRationale(selectedCandidate?.rationale).length > 0 ? (
                  <div className="drawer-list">
                    {splitRationale(selectedCandidate?.rationale).map((reason) => (
                      <div key={reason} className="drawer-list-item">
                        {reason}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="drawer-copy-block">
                    <p>No hay razones disponibles para este caso.</p>
                  </div>
                )}
              </section>

              <section className="drawer-section drawer-section-actions">
                <span className="eyebrow">Acciones</span>
                <ReceiptDrawerActions
                  receiptId={selectedReceipt.id}
                  defaultChargeId={selectedCandidate?.chargeId ?? null}
                  chargeOptions={chargeOptions}
                  existingDecisionType={selectedCase?.reviewTask?.decisionType ?? selectedReceipt.reviewTask?.decisionType ?? null}
                />
              </section>
            </div>
          </aside>
        </>
      ) : null}

      <article className="data-panel" id="conciliaciones">
        <div className="data-panel-header">
          <span className="eyebrow">Conciliaciones</span>
          <h2 className="card-title">Bandeja de resultados y trazabilidad</h2>
          <p className="toolbar-note">Resultados visibles: {filteredReconciliations.length}</p>
        </div>

        {filteredReconciliations.length === 0 ? (
          <div className="table-empty">
            <EmptyState
              title="Todavia no hay conciliaciones para mostrar"
              description="Cuando el sistema cierre pagos o el equipo confirme casos manuales, los resultados apareceran aqui."
            />
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Comprobante</th>
                <th>Estado</th>
                <th>Pago</th>
                <th>Cargo aplicado</th>
                <th>Decision</th>
                <th>Trazabilidad</th>
              </tr>
            </thead>
            <tbody>
              {filteredReconciliations.map((reconciliation) => {
                const reconciliationMeta = getReconciliationStatusMeta(reconciliation.status);

                return (
                  <tr key={reconciliation.id}>
                    <td>
                      <div className="cell-title">
                        {reconciliation.receipt.originalFileName ?? reconciliation.receiptId}
                      </div>
                      <div className="cell-subtitle">
                        {reconciliation.receipt.student?.fullName ??
                          reconciliation.allocations[0]?.charge.student.fullName ??
                          "Sin alumno"}
                      </div>
                    </td>
                    <td>
                      <StatusBadge
                        label={reconciliationMeta.label}
                        tone={reconciliationMeta.tone}
                      />
                      <div className="cell-subtitle">
                        Score {Math.round(reconciliation.matchScore * 100)}%
                      </div>
                    </td>
                    <td>
                      <div>{formatCurrencyFromCents(reconciliation.payment.amountCents)}</div>
                      <div className="cell-subtitle">
                        {reconciliation.payment.senderName ?? "Sin remitente"}
                      </div>
                    </td>
                    <td>
                      {reconciliation.allocations[0] ? (
                        <>
                          <strong>{reconciliation.allocations[0].charge.description}</strong>
                          <div className="cell-subtitle">
                            {formatCurrencyFromCents(reconciliation.allocations[0].amountCents)}
                          </div>
                        </>
                      ) : (
                        "Sin asignacion"
                      )}
                    </td>
                    <td>
                      {reconciliation.status === "AUTO_CONFIRMED"
                        ? "Automatica"
                        : reconciliation.status === "CONFIRMED"
                          ? "Confirmada por el equipo"
                          : "Pendiente"}
                    </td>
                    <td>
                      <div>{reconciliation.strategy}</div>
                      <div className="cell-subtitle">{reconciliation.notes ?? "Sin notas"}</div>
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



