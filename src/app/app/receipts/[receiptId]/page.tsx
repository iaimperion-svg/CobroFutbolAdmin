import { notFound } from "next/navigation";
import { ReceiptDrawerActions } from "@/components/receipts/receipt-drawer-actions";
import {
  StatusBadge,
  getConfidenceMeta,
  getManualDecisionMeta,
  getReceiptStatusMeta,
  getReconciliationStatusMeta
} from "@/components/ui/status-badge";
import { requireSession } from "@/server/auth/session";
import { listCharges } from "@/server/services/charges.service";
import { getReceiptReviewCase } from "@/server/services/manual-review.service";
import { formatCurrencyFromCents } from "@/server/utils/money";

type ParamsInput = Promise<{ receiptId: string }>;
type SearchParamsInput = Promise<Record<string, string | string[] | undefined>>;

function readTextParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function splitRationale(rationale: string | null | undefined) {
  if (!rationale) {
    return [];
  }

  return rationale
    .split(/[.;]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function sanitizeReturnPath(value: string) {
  if (value.startsWith("/app/receipts") || value.startsWith("/app/reviews")) {
    return value;
  }

  return "/app/receipts";
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

function truncateText(value: string | null | undefined, maxLength = 180) {
  if (!value) {
    return "Sin texto o caption";
  }

  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function normalizeReferenceValue(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value
    .toUpperCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/(?:FECHA|MONTO|REMITENTE|EMISOR|BANCO|TIPO|CUENTA|HORA).*/g, "");

  return normalized.length > 0 ? normalized : null;
}

function scoreReferenceCandidate(value: string) {
  const segments = value.split("-").filter(Boolean);
  const digits = (value.match(/\d/g) ?? []).length;

  let score = value.length;
  if (segments.length >= 3) score += 12;
  if (digits >= 4) score += 10;
  if (value.includes("-")) score += 6;

  return score;
}

function pickReferenceFromText(rawText: string) {
  if (!rawText) {
    return null;
  }

  const labelPattern =
    /(?:referencia|trx|operacion|folio|codigo(?:\s+de)?\s+transacci[o\u00f3]n)\b/giu;
  const labeledCandidates = [...rawText.matchAll(labelPattern)].flatMap((labelMatch) => {
    const start = labelMatch.index ?? 0;
    const chunk = rawText.slice(start, Math.min(start + 96, rawText.length));
    const candidate =
      chunk.match(
        /(?:referencia|trx|operacion|folio|codigo(?:\s+de)?\s+transacci[o\u00f3]n)\s*[:#-]*\s*([A-Z0-9][A-Z0-9\s-]{3,64})/iu
      )?.[1] ?? null;
    const normalized = normalizeReferenceValue(candidate);

    return normalized ? [normalized] : [];
  });

  const genericCandidates = [...rawText.matchAll(/\b[A-Z0-9]{2,}(?:[-\s][A-Z0-9]{2,}){1,7}\b/g)]
    .map((match) => normalizeReferenceValue(match[0]))
    .filter((value): value is string => Boolean(value && value.length >= 8));

  const candidates = [...labeledCandidates, ...genericCandidates];
  if (candidates.length === 0) {
    return null;
  }

  return candidates.sort((left, right) => scoreReferenceCandidate(right) - scoreReferenceCandidate(left))[0] ?? null;
}

function completeReferenceWithFollowingToken(text: string, baseReference: string | null) {
  if (!text || !baseReference || baseReference.length < 4) {
    return baseReference;
  }

  const escaped = baseReference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const continuation = text.match(new RegExp(`${escaped}(?:[-\\s]*)([A-Z0-9]{4,12})`, "i"));

  if (!continuation?.[1]) {
    return baseReference;
  }

  const completed = normalizeReferenceValue(`${baseReference}-${continuation[1]}`);
  if (!completed || completed.length <= baseReference.length) {
    return baseReference;
  }

  return completed;
}

function getDisplayReference(receipt: { extractedReference?: string | null; extractedText?: string | null }) {
  const directReference = normalizeReferenceValue(receipt.extractedReference);
  const rawText = receipt.extractedText ?? "";
  const recoveredReference = completeReferenceWithFollowingToken(rawText, pickReferenceFromText(rawText));
  const completedDirectReference = completeReferenceWithFollowingToken(rawText, directReference);
  const candidates = [recoveredReference, completedDirectReference, directReference].filter(
    (value): value is string => Boolean(value)
  );

  if (candidates.length === 0) {
    return "Sin referencia";
  }

  return candidates.sort((left, right) => scoreReferenceCandidate(right) - scoreReferenceCandidate(left))[0] ?? "Sin referencia";
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

export default async function ReceiptDetailPage(props: {
  params: ParamsInput;
  searchParams?: SearchParamsInput;
}) {
  const session = await requireSession();
  const { receiptId } = await props.params;
  const query = props.searchParams ? await props.searchParams : {};
  const returnTo = sanitizeReturnPath(readTextParam(query.from));
  const selectedTab = readTextParam(query.tab);

  const [selectedCase, charges] = await Promise.all([
    getReceiptReviewCase(receiptId, session.schoolId).catch(() => null),
    listCharges(session.schoolId)
  ]);

  if (!selectedCase) {
    notFound();
  }

  const selectedReceipt = selectedCase;
  const selectedCandidate = selectedCase.candidateMatches[0] ?? null;
  const selectedReconciliation = selectedCase.reconciliations[0] ?? null;
  const selectedAssetUrl = getReceiptAssetUrl(selectedReceipt);
  const selectedConfidenceMeta = selectedCandidate
    ? getConfidenceMeta(selectedCandidate.confidence)
    : null;
  const selectedStudentName =
    selectedCandidate?.student?.fullName ??
    selectedCandidate?.charge?.student?.fullName ??
    selectedReceipt.student?.fullName ??
    "Sin sugerencia";
  const selectedConfidenceScore = selectedCandidate ? Math.round(selectedCandidate.confidence * 100) : null;
  const selectedDecisionMeta = selectedCase.reviewTask?.decisionType
    ? getManualDecisionMeta(selectedCase.reviewTask.decisionType)
    : null;
  const selectedReference = getDisplayReference(selectedReceipt);

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

  return (
    <section className="stack receipts-screen receipt-detail-page">
      <section className="app-header receipt-detail-header">
        <div className="receipts-heading">
          <span className="eyebrow">Detalle del comprobante</span>
          <h1 className="receipts-title">{selectedReceipt.originalFileName ?? selectedReceipt.id}</h1>
          <p className="receipts-subtitle">
            Imagen del comprobante a la izquierda y lectura OCR con conciliacion a la derecha.
          </p>
        </div>

        <div className="receipt-detail-header-actions">
          <a className="button-secondary button-small" href={returnTo}>
            Volver a la bandeja
          </a>
          {selectedAssetUrl ? (
            <a
              className="button-secondary button-small"
              href={selectedAssetUrl}
              target="_blank"
              rel="noreferrer"
            >
              Abrir archivo
            </a>
          ) : null}
        </div>
      </section>

      <section className="receipt-detail-layout">
        <article className="app-card stack receipt-detail-media">
          <div className="receipt-detail-media-header">
            <span className="eyebrow">Comprobante</span>
            <div className="drawer-inline-meta">
              <StatusBadge label={getFileKindLabel(selectedReceipt.mimeType)} tone="neutral" />
              <StatusBadge
                label={getReceiptStatusMeta(selectedReceipt.status).label}
                tone={getReceiptStatusMeta(selectedReceipt.status).tone}
              />
            </div>
          </div>

          {selectedAssetUrl && selectedReceipt.mimeType?.startsWith("image/") ? (
            <div className="receipt-detail-preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedAssetUrl}
                alt={selectedReceipt.originalFileName ?? "Comprobante"}
                className="receipt-detail-image"
              />
            </div>
          ) : null}

          {selectedAssetUrl && selectedReceipt.mimeType?.includes("pdf") ? (
            <div className="receipt-detail-preview">
              <iframe
                src={selectedAssetUrl}
                title={selectedReceipt.originalFileName ?? "Comprobante PDF"}
                className="receipt-detail-pdf"
              />
            </div>
          ) : null}

          {!selectedAssetUrl ? (
            <div className="receipt-preview-card receipt-preview-fallback">
              <p>No hay vista previa disponible para este comprobante.</p>
            </div>
          ) : null}

          {selectedAssetUrl &&
          !selectedReceipt.mimeType?.startsWith("image/") &&
          !selectedReceipt.mimeType?.includes("pdf") ? (
            <div className="receipt-preview-card receipt-preview-fallback">
              <p>Formato sin vista previa integrada.</p>
              <a className="table-link" href={selectedAssetUrl} target="_blank" rel="noreferrer">
                Abrir archivo
              </a>
            </div>
          ) : null}
        </article>

        <div className="receipt-detail-right">
          <article className="app-card stack receipt-detail-card-flat">
            <span className="eyebrow">Datos extraidos</span>
            <div className="receipt-detail-data-grid">
              <div className="receipt-detail-data-item">
                <span className="drawer-label">Remitente</span>
                <strong>
                  {selectedReceipt.message?.senderName ??
                    selectedReceipt.extractedSenderName ??
                    "Sin remitente"}
                </strong>
              </div>
              <div className="receipt-detail-data-item">
                <span className="drawer-label">Alumno sugerido</span>
                <strong>{selectedStudentName}</strong>
              </div>
              <div className="receipt-detail-data-item">
                <span className="drawer-label">Monto</span>
                <strong>
                  {selectedReceipt.extractedAmountCents
                    ? formatCurrencyFromCents(selectedReceipt.extractedAmountCents)
                    : "Sin monto"}
                </strong>
              </div>
              <div className="receipt-detail-data-item receipt-detail-data-item-reference receipt-detail-data-item-wide">
                <span className="drawer-label">Referencia</span>
                <strong className="receipt-detail-reference-value">{selectedReference}</strong>
              </div>
              <div className="receipt-detail-data-item">
                <span className="drawer-label">Confianza OCR</span>
                <div className="drawer-inline-meta">
                  <strong>{selectedConfidenceScore != null ? `${selectedConfidenceScore}%` : "Sin lectura"}</strong>
                  {selectedConfidenceMeta ? (
                    <StatusBadge label={selectedConfidenceMeta.label} tone={selectedConfidenceMeta.tone} />
                  ) : (
                    <StatusBadge label="Sin sugerencia" tone="neutral" />
                  )}
                </div>
              </div>
              <div className={`receipt-detail-data-item${selectedTab === "conciliacion" ? " is-highlighted" : ""}`}>
                <span className="drawer-label">Conciliacion</span>
                <div className="drawer-inline-meta drawer-inline-meta-stack">
                  {selectedReconciliation ? (
                    <>
                      <StatusBadge
                        label={getReconciliationStatusMeta(selectedReconciliation.status).label}
                        tone={getReconciliationStatusMeta(selectedReconciliation.status).tone}
                      />
                      <ReconciliationMode
                        mode={selectedReconciliation.status === "AUTO_CONFIRMED" ? "auto" : "manual"}
                      />
                    </>
                  ) : (
                    <ReconciliationMode mode="pending" />
                  )}
                  {selectedDecisionMeta ? (
                    <StatusBadge label={selectedDecisionMeta.label} tone={selectedDecisionMeta.tone} />
                  ) : null}
                </div>
              </div>
            </div>

            <span className="eyebrow">Origen y contexto</span>
            <div className="receipt-detail-data-grid">
              <div className="receipt-detail-data-item">
                <span className="drawer-label">Canal</span>
                <strong>{getChannelLabel(selectedReceipt.channel)}</strong>
              </div>
              <div className="receipt-detail-data-item">
                <span className="drawer-label">Fecha</span>
                <strong>
                  {selectedReceipt.message?.sentAt
                    ? formatDateTime(selectedReceipt.message.sentAt)
                    : formatDateTime(selectedReceipt.receivedAt)}
                </strong>
              </div>
              <div className="receipt-detail-data-item">
                <span className="drawer-label">Chat</span>
                <strong>{selectedReceipt.message?.externalChatId ?? "Sin chat"}</strong>
              </div>
              <div className="receipt-detail-data-item">
                <span className="drawer-label">Usuario</span>
                <strong>
                  {selectedReceipt.message?.senderUsername
                    ? `@${selectedReceipt.message.senderUsername}`
                    : "Sin usuario"}
                </strong>
              </div>
              <div className="receipt-detail-data-item receipt-detail-data-item-wide">
                <span className="drawer-label">Texto del mensaje</span>
                <p className="receipt-detail-caption">{truncateText(selectedReceipt.message?.bodyText)}</p>
              </div>
            </div>
          </article>

          <article className="app-card stack">
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
          </article>

          <article className="app-card stack">
            <span className="eyebrow">Acciones de revisión</span>
            <ReceiptDrawerActions
              receiptId={selectedReceipt.id}
              defaultChargeId={selectedCandidate?.chargeId ?? null}
              existingDecisionType={selectedCase.reviewTask?.decisionType ?? null}
              chargeOptions={chargeOptions}
            />
          </article>
        </div>
      </section>
    </section>
  );
}
