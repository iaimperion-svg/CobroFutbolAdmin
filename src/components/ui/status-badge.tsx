type BadgeTone = "success" | "warning" | "danger" | "neutral";

type StatusMeta = {
  label: string;
  tone: BadgeTone;
};

const receiptStatusMap: Record<string, StatusMeta> = {
  RECEIVED: { label: "Recibido", tone: "neutral" },
  PROCESSING: { label: "Procesando", tone: "warning" },
  MATCHED: { label: "Conciliado por el equipo", tone: "success" },
  AUTO_RECONCILED: { label: "Conciliado automaticamente", tone: "success" },
  MANUAL_REVIEW: { label: "Requiere revision", tone: "warning" },
  REJECTED: { label: "Rechazado", tone: "danger" },
  FAILED: { label: "Error de procesamiento", tone: "danger" }
};

const reconciliationStatusMap: Record<string, StatusMeta> = {
  SUGGESTED: { label: "Requiere revision", tone: "warning" },
  CONFIRMED: { label: "Conciliado por el equipo", tone: "success" },
  AUTO_CONFIRMED: { label: "Conciliado automaticamente", tone: "success" },
  REJECTED: { label: "Rechazado", tone: "danger" }
};

const chargeStatusMap: Record<string, StatusMeta> = {
  PENDING: { label: "Pendiente", tone: "warning" },
  PARTIALLY_PAID: { label: "Abono parcial", tone: "warning" },
  PAID: { label: "Pagado", tone: "success" },
  OVERDUE: { label: "Vencido", tone: "danger" },
  CANCELED: { label: "Anulado", tone: "neutral" }
};

const reviewStatusMap: Record<string, StatusMeta> = {
  OPEN: { label: "En revision", tone: "warning" },
  IN_PROGRESS: { label: "En revision", tone: "warning" },
  RESOLVED: { label: "Resuelta", tone: "success" }
};

const manualDecisionMap: Record<string, StatusMeta> = {
  APPROVED_SUGGESTION: { label: "Aprobado", tone: "success" },
  REJECTED_SUGGESTION: { label: "Rechazado", tone: "danger" },
  REASSIGNED: { label: "Reasignado", tone: "warning" },
  MANUAL_PAYMENT: { label: "Pago manual", tone: "success" },
  REPROCESSED: { label: "Reprocesado", tone: "neutral" }
};

function fallbackStatusMeta(status: string): StatusMeta {
  return {
    label: status.replaceAll("_", " ").toLowerCase(),
    tone: "neutral"
  };
}

export function getReceiptStatusMeta(status: string) {
  return receiptStatusMap[status] ?? fallbackStatusMeta(status);
}

export function getReconciliationStatusMeta(status: string) {
  return reconciliationStatusMap[status] ?? fallbackStatusMeta(status);
}

export function getChargeStatusMeta(status: string) {
  return chargeStatusMap[status] ?? fallbackStatusMeta(status);
}

export function getReviewStatusMeta(status: string) {
  return reviewStatusMap[status] ?? fallbackStatusMeta(status);
}

export function getManualDecisionMeta(status: string) {
  return manualDecisionMap[status] ?? fallbackStatusMeta(status);
}

export function getPriorityMeta(priority: number): StatusMeta {
  if (priority <= 1) {
    return { label: "Urgente", tone: "danger" };
  }

  if (priority === 2) {
    return { label: "Seguimiento", tone: "warning" };
  }

  return { label: "Normal", tone: "neutral" };
}

export function getConfidenceMeta(confidence: number) {
  if (confidence >= 0.85) {
    return { label: "Alta para conciliar", tone: "success" as const };
  }

  if (confidence >= 0.7) {
    return { label: "Media para validar", tone: "warning" as const };
  }

  return { label: "Baja, revisar", tone: "danger" as const };
}

export function StatusBadge(props: { label: string; tone: BadgeTone }) {
  return <span className={`pill ${props.tone}`}>{props.label}</span>;
}
