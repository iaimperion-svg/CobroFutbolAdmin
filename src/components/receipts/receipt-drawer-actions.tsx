"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { StatusBadge, getManualDecisionMeta } from "@/components/ui/status-badge";
import { formatCurrencyFromCents } from "@/server/utils/money";

type ChargeOption = {
  id: string;
  studentId: string;
  studentName: string;
  guardianId?: string | null;
  guardianName?: string | null;
  description: string;
  periodLabel?: string | null;
  amountCents: number;
  outstandingCents: number;
  dueDate: string;
};

type ActionMode = "approve" | "reject" | "reassign" | "manual-payment" | "reprocess" | "note";

const actionTabs: Array<{ mode: ActionMode; label: string }> = [
  { mode: "approve", label: "Aprobar" },
  { mode: "reject", label: "Rechazar" },
  { mode: "reassign", label: "Reasignar" },
  { mode: "manual-payment", label: "Pago manual" },
  { mode: "reprocess", label: "Reprocesar" },
  { mode: "note", label: "Observación" }
];

const rejectionOptions = [
  { value: "COMPROBANTE_ILEGIBLE", label: "Comprobante ilegible" },
  { value: "MONTO_NO_COINCIDE", label: "Monto no coincide" },
  { value: "REMITENTE_NO_IDENTIFICADO", label: "Remitente no identificado" },
  { value: "COMPROBANTE_DUPLICADO", label: "Comprobante duplicado" },
  { value: "NO_CORRESPONDE_A_ESTA_ACADEMIA", label: "No corresponde a esta academia" },
  { value: "OTRO", label: "Otro" }
] as const;

function formatChargeLabel(option: ChargeOption) {
  const dueDate = new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short"
  }).format(new Date(option.dueDate));

  return `${option.studentName} | ${option.description} | ${formatCurrencyFromCents(
    option.outstandingCents
  )} pendientes | vence ${dueDate}`;
}

async function readJson(response: Response) {
  try {
    return (await response.json()) as { error?: string };
  } catch {
    return {};
  }
}

export function ReceiptDrawerActions(props: {
  receiptId: string;
  defaultChargeId?: string | null;
  existingDecisionType?: string | null;
  chargeOptions: ChargeOption[];
}) {
  const router = useRouter();
  const [activeMode, setActiveMode] = useState<ActionMode>("approve");
  const [savingAction, setSavingAction] = useState<ActionMode | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<"success" | "error">("success");
  const [approveNotes, setApproveNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("COMPROBANTE_ILEGIBLE");
  const [rejectNotes, setRejectNotes] = useState("");
  const [reassignSearch, setReassignSearch] = useState("");
  const [reassignChargeId, setReassignChargeId] = useState(props.defaultChargeId ?? "");
  const [reassignNotes, setReassignNotes] = useState("");
  const [manualSearch, setManualSearch] = useState("");
  const [manualChargeId, setManualChargeId] = useState(props.defaultChargeId ?? "");
  const [manualNotes, setManualNotes] = useState("");
  const [reprocessNotes, setReprocessNotes] = useState("");
  const [noteBody, setNoteBody] = useState("");

  const filteredReassignCharges = props.chargeOptions.filter((option) => {
    const search = reassignSearch.trim().toLowerCase();
    if (!search) return true;

    return (
      option.studentName.toLowerCase().includes(search) ||
      (option.guardianName ?? "").toLowerCase().includes(search) ||
      option.description.toLowerCase().includes(search) ||
      (option.periodLabel ?? "").toLowerCase().includes(search)
    );
  });

  const filteredManualCharges = props.chargeOptions.filter((option) => {
    const search = manualSearch.trim().toLowerCase();
    if (!search) return true;

    return (
      option.studentName.toLowerCase().includes(search) ||
      (option.guardianName ?? "").toLowerCase().includes(search) ||
      option.description.toLowerCase().includes(search) ||
      (option.periodLabel ?? "").toLowerCase().includes(search)
    );
  });

  const suggestedCharge =
    props.chargeOptions.find((option) => option.id === props.defaultChargeId) ?? null;
  const currentDecisionMeta = props.existingDecisionType
    ? getManualDecisionMeta(props.existingDecisionType)
    : null;

  async function submitAction(
    mode: ActionMode,
    url: string,
    body: Record<string, unknown>,
    successMessage: string,
    confirmationMessage?: string
  ) {
    if (confirmationMessage && !window.confirm(confirmationMessage)) {
      return false;
    }

    setSavingAction(mode);
    setFeedback(null);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const payload = await readJson(response);
    setSavingAction(null);

    if (!response.ok) {
      setFeedbackTone("error");
      setFeedback(payload.error ?? "No se pudo completar la acción.");
      return false;
    }

    setFeedbackTone("success");
    setFeedback(successMessage);
    router.refresh();
    return true;
  }

  return (
    <div className="drawer-actions-block">
      {currentDecisionMeta ? (
        <div className="drawer-current-decision">
          <span className="drawer-label">Última resolución</span>
          <StatusBadge label={currentDecisionMeta.label} tone={currentDecisionMeta.tone} />
        </div>
      ) : null}

      <div className="drawer-action-tabs">
        {actionTabs.map((tab) => (
          <button
            key={tab.mode}
            type="button"
            className={`drawer-tab drawer-tab-minimal${activeMode === tab.mode ? " active" : ""}`}
            onClick={() => setActiveMode(tab.mode)}
            aria-pressed={activeMode === tab.mode}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="drawer-action-panel">
        {activeMode === "approve" ? (
          <div className="stack" style={{ gap: 12 }}>
            <div className="drawer-copy-block compact">
              <p>
                {suggestedCharge
                  ? `Aprobarás la sugerencia actual para ${suggestedCharge.studentName}.`
                  : "No hay un cargo sugerido para aprobar automáticamente."}
              </p>
              {suggestedCharge ? <strong>{formatChargeLabel(suggestedCharge)}</strong> : null}
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor={`approve-notes-${props.receiptId}`}>Observación de cierre</label>
              <textarea
                id={`approve-notes-${props.receiptId}`}
                value={approveNotes}
                onChange={(event) => setApproveNotes(event.target.value)}
                placeholder="Opcional. Explica por qué se aprueba esta conciliación."
                rows={3}
              />
            </div>
            <button
              type="button"
              className="button button-small"
              disabled={savingAction === "approve" || !props.defaultChargeId}
              onClick={() =>
                submitAction(
                  "approve",
                  `/api/v1/receipts/${props.receiptId}/review/approve`,
                  {
                    chargeId: props.defaultChargeId,
                    resolutionNotes: approveNotes || undefined
                  },
                  "Conciliación aprobada correctamente.",
                  "¿Confirmas que deseas aprobar la conciliación sugerida?"
                )
              }
            >
              {savingAction === "approve" ? "Aprobando..." : "Aprobar conciliación"}
            </button>
          </div>
        ) : null}

        {activeMode === "reject" ? (
          <div className="stack" style={{ gap: 12 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor={`reject-reason-${props.receiptId}`}>Motivo del rechazo</label>
              <select
                id={`reject-reason-${props.receiptId}`}
                value={rejectionReason}
                onChange={(event) => setRejectionReason(event.target.value)}
              >
                {rejectionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor={`reject-notes-${props.receiptId}`}>Observación interna</label>
              <textarea
                id={`reject-notes-${props.receiptId}`}
                value={rejectNotes}
                onChange={(event) => setRejectNotes(event.target.value)}
                placeholder="Explica por qué se rechaza el caso y qué debería revisarse después."
                rows={3}
              />
            </div>
            <button
              type="button"
              className="button-secondary button-small"
              disabled={savingAction === "reject"}
              onClick={() =>
                submitAction(
                  "reject",
                  `/api/v1/receipts/${props.receiptId}/review/reject`,
                  {
                    rejectionReason,
                    resolutionNotes: rejectNotes || undefined
                  },
                  "Comprobante rechazado correctamente.",
                  "¿Confirmas que deseas rechazar esta conciliación sugerida?"
                )
              }
            >
              {savingAction === "reject" ? "Rechazando..." : "Confirmar rechazo"}
            </button>
          </div>
        ) : null}

        {activeMode === "reassign" ? (
          <div className="stack" style={{ gap: 12 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor={`reassign-search-${props.receiptId}`}>Buscar alumno o apoderado</label>
              <input
                id={`reassign-search-${props.receiptId}`}
                value={reassignSearch}
                onChange={(event) => setReassignSearch(event.target.value)}
                placeholder="Buscar por alumno, apoderado, cargo o período"
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor={`reassign-charge-${props.receiptId}`}>Cargo destino</label>
              <select
                id={`reassign-charge-${props.receiptId}`}
                value={reassignChargeId}
                onChange={(event) => setReassignChargeId(event.target.value)}
              >
                <option value="">Selecciona un cargo pendiente</option>
                {filteredReassignCharges.map((option) => (
                  <option key={option.id} value={option.id}>
                    {formatChargeLabel(option)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor={`reassign-notes-${props.receiptId}`}>Observación de reasignación</label>
              <textarea
                id={`reassign-notes-${props.receiptId}`}
                value={reassignNotes}
                onChange={(event) => setReassignNotes(event.target.value)}
                placeholder="Opcional. Explica por qué se reasigna el comprobante."
                rows={3}
              />
            </div>
            <button
              type="button"
              className="button-secondary button-small"
              disabled={savingAction === "reassign" || !reassignChargeId}
              onClick={() => {
                const selectedCharge =
                  props.chargeOptions.find((option) => option.id === reassignChargeId) ?? null;

                return submitAction(
                  "reassign",
                  `/api/v1/receipts/${props.receiptId}/review/reassign`,
                  {
                    chargeId: reassignChargeId,
                    studentId: selectedCharge?.studentId,
                    guardianId: selectedCharge?.guardianId ?? undefined,
                    resolutionNotes: reassignNotes || undefined
                  },
                  "Comprobante reasignado correctamente.",
                  "¿Confirmas la reasignación de este comprobante al nuevo destino?"
                );
              }}
            >
              {savingAction === "reassign" ? "Reasignando..." : "Confirmar reasignación"}
            </button>
          </div>
        ) : null}

        {activeMode === "manual-payment" ? (
          <div className="stack" style={{ gap: 12 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor={`manual-search-${props.receiptId}`}>Buscar cargo pendiente</label>
              <input
                id={`manual-search-${props.receiptId}`}
                value={manualSearch}
                onChange={(event) => setManualSearch(event.target.value)}
                placeholder="Buscar por alumno, apoderado, cargo o período"
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor={`manual-charge-${props.receiptId}`}>Cargo a confirmar</label>
              <select
                id={`manual-charge-${props.receiptId}`}
                value={manualChargeId}
                onChange={(event) => setManualChargeId(event.target.value)}
              >
                <option value="">Selecciona un cargo pendiente</option>
                {filteredManualCharges.map((option) => (
                  <option key={option.id} value={option.id}>
                    {formatChargeLabel(option)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor={`manual-notes-${props.receiptId}`}>Observación del pago manual</label>
              <textarea
                id={`manual-notes-${props.receiptId}`}
                value={manualNotes}
                onChange={(event) => setManualNotes(event.target.value)}
                placeholder="Explica por qué se confirma este pago manualmente."
                rows={3}
              />
            </div>
            <button
              type="button"
              className="button button-small"
              disabled={savingAction === "manual-payment" || !manualChargeId}
              onClick={() =>
                submitAction(
                  "manual-payment",
                  `/api/v1/receipts/${props.receiptId}/review/manual-payment`,
                  {
                    chargeId: manualChargeId,
                    resolutionNotes: manualNotes || undefined
                  },
                  "Pago manual confirmado correctamente.",
                  "¿Confirmas que este comprobante debe cerrarse como pago manual?"
                )
              }
            >
              {savingAction === "manual-payment" ? "Confirmando..." : "Marcar como pago manual"}
            </button>
          </div>
        ) : null}

        {activeMode === "reprocess" ? (
          <div className="stack" style={{ gap: 12 }}>
            <div className="drawer-copy-block compact">
              <p>Reprocesar vuelve a correr el matching del comprobante y refresca sus sugerencias.</p>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor={`reprocess-notes-${props.receiptId}`}>Motivo del reproceso</label>
              <textarea
                id={`reprocess-notes-${props.receiptId}`}
                value={reprocessNotes}
                onChange={(event) => setReprocessNotes(event.target.value)}
                placeholder="Opcional. Indica qué cambió o por qué deseas reintentar el caso."
                rows={3}
              />
            </div>
            <button
              type="button"
              className="button-secondary button-small"
              disabled={savingAction === "reprocess"}
              onClick={() =>
                submitAction(
                  "reprocess",
                  `/api/v1/receipts/${props.receiptId}/review/reprocess`,
                  {
                    resolutionNotes: reprocessNotes || undefined
                  },
                  "Comprobante enviado nuevamente a procesamiento.",
                  "¿Confirmas que deseas reprocesar este comprobante?"
                )
              }
            >
              {savingAction === "reprocess" ? "Reprocesando..." : "Reprocesar comprobante"}
            </button>
          </div>
        ) : null}

        {activeMode === "note" ? (
          <div className="stack" style={{ gap: 12 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor={`internal-note-${props.receiptId}`}>Observación interna</label>
              <textarea
                id={`internal-note-${props.receiptId}`}
                value={noteBody}
                onChange={(event) => setNoteBody(event.target.value)}
                placeholder="Deja contexto para el siguiente revisor o para auditoría."
                rows={4}
              />
            </div>
            <button
              type="button"
              className="button-secondary button-small"
              disabled={savingAction === "note" || noteBody.trim().length < 3}
              onClick={async () => {
                const ok = await submitAction(
                  "note",
                  `/api/v1/receipts/${props.receiptId}/notes`,
                  {
                    body: noteBody
                  },
                  "Observación guardada correctamente."
                );

                if (ok) {
                  setNoteBody("");
                }
              }}
            >
              {savingAction === "note" ? "Guardando..." : "Guardar observación"}
            </button>
          </div>
        ) : null}
      </div>

      <div className="drawer-actions-footer">
        {feedback ? (
          <span className={`form-feedback ${feedbackTone === "success" ? "success" : "danger"}`}>
            {feedback}
          </span>
        ) : (
          <span className="drawer-actions-hint">
            Elige una acción, confirma y la bandeja se actualizará al instante.
          </span>
        )}
      </div>
    </div>
  );
}
