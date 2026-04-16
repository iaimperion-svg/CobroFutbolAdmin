"use client";

import { ContactChannel } from "@prisma/client";
import { startTransition, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";

type StudentRow = {
  id: string;
  fullName: string;
  externalCode: string | null;
  monthlyFeeCents: number | null;
  billingDay: number;
  notes: string | null;
  active: boolean;
  guardians: Array<{
    relationship: string;
    isPrimary: boolean;
    guardian: {
      id: string;
      fullName: string;
      phone: string | null;
      email: string | null;
      preferredChannel: ContactChannel;
    };
  }>;
  charges: Array<{
    amountCents: number;
    outstandingCents: number;
    periodLabel: string | null;
    status: string;
  }>;
};

type ApiResponse<T> = {
  data?: T;
  error?: string;
};

const currencyFormatter = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0
});

function formatCurrencyFromCents(amountCents: number) {
  return currencyFormatter.format(amountCents / 100);
}

function sortByName(items: StudentRow[]) {
  return [...items].sort((left, right) => left.fullName.localeCompare(right.fullName, "es-CL"));
}

function getPrimaryGuardian(student: StudentRow) {
  return student.guardians.find((relation) => relation.isPrimary) ?? student.guardians[0] ?? null;
}

function getCategoryLabel(notes: string | null) {
  const normalized = (notes ?? "").trim();

  if (!normalized) {
    return "Sin categoria";
  }

  return normalized
    .replace(/^categoria\s+/i, "")
    .trim()
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function readOutstanding(student: StudentRow) {
  return student.charges.reduce((total, charge) => total + charge.outstandingCents, 0);
}

function readMonthlyChargeSummary(student: StudentRow, reviewPeriod: string) {
  const periodCharges = student.charges.filter(
    (charge) => charge.periodLabel === reviewPeriod && charge.status !== "CANCELED"
  );
  const billedCents = periodCharges.reduce((total, charge) => total + charge.amountCents, 0);
  const outstandingCents = periodCharges.reduce((total, charge) => total + charge.outstandingCents, 0);
  const hasCharge = periodCharges.length > 0;
  const isConsolidated = hasCharge && outstandingCents === 0;
  const isOverdue = periodCharges.some((charge) => charge.status === "OVERDUE");
  const isPartial = hasCharge && outstandingCents > 0 && outstandingCents < billedCents;

  return {
    hasCharge,
    billedCents,
    outstandingCents,
    isConsolidated,
    statusLabel: !hasCharge
      ? "Sin cargo del mes"
      : isConsolidated
        ? "Consolidada"
        : isOverdue
          ? "Vencida"
          : isPartial
            ? "Abono parcial"
            : "Pendiente",
    statusTone: !hasCharge
      ? ("neutral" as const)
      : isConsolidated
        ? ("success" as const)
        : isOverdue
          ? ("danger" as const)
          : ("warning" as const)
  };
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M9 4h6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="m4 10 4 4 8-8" />
    </svg>
  );
}

export function StudentsCrudPanel(props: {
  initialStudents: StudentRow[];
  isFiltered: boolean;
  reviewPeriod: string;
  reviewPeriodLabel: string;
  activeCategoryLabel: string;
}) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const students = useMemo(() => sortByName(props.initialStudents), [props.initialStudents]);

  async function handleDelete(student: StudentRow) {
    const accepted = window.confirm(
      `Se eliminara el alumno "${student.fullName}". Esta accion no se puede deshacer.`
    );

    if (!accepted) {
      return;
    }

    setDeletingId(student.id);

    try {
      const response = await fetch(`/api/v1/students/${student.id}`, {
        method: "DELETE"
      });
      const payload = (await response.json()) as ApiResponse<{ deleted: boolean }>;

      if (!response.ok) {
        window.alert(payload.error ?? "No se pudo eliminar el alumno.");
        return;
      }

      startTransition(() => {
        router.refresh();
      });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <article className="data-panel">
      <div className="data-panel-header">
        <span className="eyebrow">Revision mensual</span>
        <h2 className="card-title">Alumnos por categoria y estado del mes</h2>
        <p className="toolbar-note">
          {props.reviewPeriodLabel} | {props.activeCategoryLabel} | {students.length} resultados
        </p>
      </div>
      {students.length === 0 ? (
        <div className="table-empty">
          <EmptyState
            title={
              props.isFiltered
                ? "No encontramos alumnos con esos filtros"
                : "Todavia no hay alumnos registrados"
            }
            description={
              props.isFiltered
                ? "Prueba con otra categoria, otro nombre o limpia los filtros para recuperar la vista completa."
                : "Crea tu primer alumno y asigna su apoderado principal para comenzar a operar."
            }
            actionHref={props.isFiltered ? "/app/students" : "/app/students/new"}
            actionLabel={props.isFiltered ? "Ver todos los alumnos" : "Nuevo alumno"}
          />
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Alumno</th>
              <th>Categoria</th>
              <th>Apoderado principal</th>
              <th>Estado del mes</th>
              <th>Saldo del mes</th>
              <th>Consolidada</th>
              <th>Deuda abierta</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => {
              const outstanding = readOutstanding(student);
              const primaryGuardian = getPrimaryGuardian(student);
              const categoryLabel = getCategoryLabel(student.notes);
              const monthlySummary = readMonthlyChargeSummary(student, props.reviewPeriod);

              return (
                <tr key={student.id}>
                  <td>
                    <div className="cell-title">{student.fullName}</div>
                    <div className="cell-subtitle">
                      {student.externalCode ?? "Sin codigo interno"} | cuota{" "}
                      {student.monthlyFeeCents
                        ? formatCurrencyFromCents(student.monthlyFeeCents)
                        : "sin definir"}
                    </div>
                  </td>
                  <td>
                    <div className="table-primary">{categoryLabel}</div>
                    <div className="table-secondary">
                      {student.active ? "Alumno activo" : "Alumno inactivo"} | cobra dia{" "}
                      {student.billingDay}
                    </div>
                  </td>
                  <td>
                    <div className="cell-title">
                      {primaryGuardian?.guardian.fullName ?? "Sin apoderado"}
                    </div>
                    <div className="cell-subtitle">
                      {primaryGuardian
                        ? `${primaryGuardian.relationship} | ${primaryGuardian.guardian.phone ?? primaryGuardian.guardian.email ?? "Sin contacto"}`
                        : "Debes asignar un responsable"}
                    </div>
                  </td>
                  <td>
                    <StatusBadge
                      label={monthlySummary.statusLabel}
                      tone={monthlySummary.statusTone}
                    />
                    <div className="table-secondary">
                      {monthlySummary.hasCharge
                        ? `Facturado ${formatCurrencyFromCents(monthlySummary.billedCents)}`
                        : "No hay cargo emitido para este mes"}
                    </div>
                  </td>
                  <td>
                    <span
                      className={`pill ${
                        !monthlySummary.hasCharge
                          ? "neutral"
                          : monthlySummary.outstandingCents > 0
                            ? "warning"
                            : "success"
                      }`}
                    >
                      {formatCurrencyFromCents(monthlySummary.outstandingCents)}
                    </span>
                  </td>
                  <td>
                    {monthlySummary.isConsolidated ? (
                      <span className="student-check-badge">
                        <CheckIcon />
                        Consolidada
                      </span>
                    ) : (
                      <span className="pill neutral">
                        {monthlySummary.hasCharge ? "Pendiente" : "Sin cargo"}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`pill ${outstanding > 0 ? "warning" : "success"}`}>
                      {formatCurrencyFromCents(outstanding)}
                    </span>
                  </td>
                  <td>
                    <div className="student-row-actions">
                      <Link
                        href={`/app/students/${student.id}`}
                        className="student-icon-button"
                        aria-label={`Editar a ${student.fullName}`}
                        title={`Editar a ${student.fullName}`}
                      >
                        <EditIcon />
                      </Link>
                      <button
                        type="button"
                        className="student-icon-button danger"
                        onClick={() => handleDelete(student)}
                        disabled={deletingId === student.id}
                        aria-label={`Eliminar a ${student.fullName}`}
                        title={`Eliminar a ${student.fullName}`}
                      >
                        <DeleteIcon />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </article>
  );
}
