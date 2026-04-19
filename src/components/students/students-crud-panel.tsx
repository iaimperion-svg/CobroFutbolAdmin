"use client";

import { ContactChannel } from "@prisma/client";
import Link from "next/link";
import { useMemo } from "react";
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
    return "Sin categoría";
  }

  return normalized
    .replace(/^categoria\s+/i, "")
    .trim()
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getContactChannelLabel(channel: ContactChannel | null | undefined) {
  switch (channel) {
    case "WHATSAPP":
      return "WhatsApp";
    case "EMAIL":
      return "Email";
    case "TELEGRAM":
      return "Telegram";
    default:
      return "Sin canal definido";
  }
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
        ? "Al día"
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

export function StudentsCrudPanel(props: {
  initialStudents: StudentRow[];
  isFiltered: boolean;
  reviewPeriod: string;
  reviewPeriodLabel: string;
  activeCategoryLabel: string;
  mode?: "students" | "monthly";
}) {
  const students = useMemo(() => sortByName(props.initialStudents), [props.initialStudents]);
  const isMonthlyMode = (props.mode ?? "students") === "monthly";
  const emptyActionHref = isMonthlyMode ? "/app/reviews/monthly" : "/app/students";
  const createActionHref = "/app/students/new";

  return (
    <article className="data-panel">
      <div className="data-panel-header">
        <span className="eyebrow">{isMonthlyMode ? "Cobro mensual" : "Alumnos"}</span>
        <h2 className="card-title">
          {isMonthlyMode ? "Detalle por alumno del mes" : "Base maestra operativa"}
        </h2>
        <p className="toolbar-note">
          {props.reviewPeriodLabel} | {props.activeCategoryLabel} | {students.length} alumno
          {students.length === 1 ? "" : "s"}
        </p>
      </div>
      {students.length === 0 ? (
        <div className="table-empty">
          <EmptyState
            title={
              props.isFiltered
                ? "No encontramos alumnos con esos filtros"
                : "Todavía no hay alumnos registrados"
            }
            description={
              props.isFiltered
                ? "Prueba con otra categoría, otro nombre o limpia los filtros para recuperar la vista completa."
                : "Crea tu primer alumno y asigna su apoderado principal para comenzar a operar."
            }
            actionHref={props.isFiltered ? emptyActionHref : createActionHref}
            actionLabel={props.isFiltered ? "Limpiar vista" : "Nuevo alumno"}
          />
        </div>
      ) : isMonthlyMode ? (
        <>
          <div className="monthly-mobile-student-list">
            {students.map((student) => {
              const primaryGuardian = getPrimaryGuardian(student);
              const categoryLabel = getCategoryLabel(student.notes);
              const monthlySummary = readMonthlyChargeSummary(student, props.reviewPeriod);

              return (
                <article key={student.id} className="monthly-mobile-student-card">
                  <div className="monthly-mobile-student-top">
                    <div className="monthly-mobile-student-copy">
                      <div className="cell-title">{student.fullName}</div>
                      <div className="cell-subtitle">
                        {student.externalCode ?? "Sin código interno"} | cuota{" "}
                        {student.monthlyFeeCents
                          ? formatCurrencyFromCents(student.monthlyFeeCents)
                          : "sin definir"}
                      </div>
                    </div>
                    <span
                      className={`pill ${
                        !monthlySummary.hasCharge
                          ? "neutral"
                          : monthlySummary.isConsolidated
                            ? "success"
                            : monthlySummary.statusTone === "danger"
                              ? "danger"
                              : "warning"
                      }`}
                    >
                      {!monthlySummary.hasCharge
                        ? "Sin cargo"
                        : monthlySummary.isConsolidated
                          ? "Al día"
                          : monthlySummary.statusTone === "danger"
                            ? "Revisar hoy"
                            : monthlySummary.statusLabel}
                    </span>
                  </div>

                  <div className="monthly-mobile-student-grid">
                    <div className="monthly-mobile-item">
                      <span className="monthly-mobile-label">Categoría</span>
                      <strong>{categoryLabel}</strong>
                      <span className="table-secondary">Día de cobro {student.billingDay}</span>
                    </div>
                    <div className="monthly-mobile-item">
                      <span className="monthly-mobile-label">Apoderado</span>
                      <strong>{primaryGuardian?.guardian.fullName ?? "Sin apoderado"}</strong>
                      <span className="table-secondary">
                        {primaryGuardian ? primaryGuardian.relationship : "Sin responsable"}
                      </span>
                    </div>
                    <div className="monthly-mobile-item">
                      <span className="monthly-mobile-label">Estado del mes</span>
                      <StatusBadge
                        label={monthlySummary.statusLabel}
                        tone={monthlySummary.statusTone}
                      />
                      <span className="table-secondary">
                        {monthlySummary.hasCharge
                          ? `Facturado ${formatCurrencyFromCents(monthlySummary.billedCents)}`
                          : "No hay cargo emitido para este mes"}
                      </span>
                    </div>
                    <div className="monthly-mobile-item">
                      <span className="monthly-mobile-label">Facturado</span>
                      <strong>{formatCurrencyFromCents(monthlySummary.billedCents)}</strong>
                    </div>
                    <div className="monthly-mobile-item">
                      <span className="monthly-mobile-label">Pendiente</span>
                      <strong>{formatCurrencyFromCents(monthlySummary.outstandingCents)}</strong>
                    </div>
                    <div className="monthly-mobile-item">
                      <span className="monthly-mobile-label">Seguimiento</span>
                      <span
                        className={`pill ${
                          !monthlySummary.hasCharge
                            ? "neutral"
                            : monthlySummary.isConsolidated
                              ? "success"
                              : monthlySummary.statusTone === "danger"
                                ? "danger"
                                : "warning"
                        }`}
                      >
                        {!monthlySummary.hasCharge
                          ? "Sin cargo"
                          : monthlySummary.isConsolidated
                            ? "Al día"
                            : monthlySummary.statusTone === "danger"
                              ? "Revisar hoy"
                              : monthlySummary.statusLabel}
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <table className="data-table monthly-students-table">
            <thead>
              <tr>
                <th>Alumno</th>
                <th>Categoría</th>
                <th>Apoderado</th>
                <th>Estado del mes</th>
                <th>Facturado</th>
                <th>Pendiente</th>
                <th>Seguimiento</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => {
                const primaryGuardian = getPrimaryGuardian(student);
                const categoryLabel = getCategoryLabel(student.notes);
                const monthlySummary = readMonthlyChargeSummary(student, props.reviewPeriod);

                return (
                  <tr key={student.id}>
                    <td>
                      <div className="cell-title">{student.fullName}</div>
                      <div className="cell-subtitle">
                        {student.externalCode ?? "Sin código interno"} | cuota{" "}
                        {student.monthlyFeeCents
                          ? formatCurrencyFromCents(student.monthlyFeeCents)
                          : "sin definir"}
                      </div>
                    </td>
                    <td>
                      <div className="table-primary">{categoryLabel}</div>
                      <div className="table-secondary">Día de cobro {student.billingDay}</div>
                    </td>
                    <td>
                      <div className="cell-title">{primaryGuardian?.guardian.fullName ?? "Sin apoderado"}</div>
                      <div className="cell-subtitle">
                        {primaryGuardian ? primaryGuardian.relationship : "Sin responsable"}
                      </div>
                    </td>
                    <td>
                      <StatusBadge label={monthlySummary.statusLabel} tone={monthlySummary.statusTone} />
                      <div className="table-secondary">
                        {monthlySummary.hasCharge
                          ? `Facturado ${formatCurrencyFromCents(monthlySummary.billedCents)}`
                          : "No hay cargo emitido para este mes"}
                      </div>
                    </td>
                    <td>
                      <span className="pill neutral">
                        {formatCurrencyFromCents(monthlySummary.billedCents)}
                      </span>
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
                      <span
                        className={`pill ${
                          !monthlySummary.hasCharge
                            ? "neutral"
                            : monthlySummary.isConsolidated
                              ? "success"
                              : monthlySummary.statusTone === "danger"
                                ? "danger"
                                : "warning"
                        }`}
                      >
                        {!monthlySummary.hasCharge
                          ? "Sin cargo"
                          : monthlySummary.isConsolidated
                            ? "Al día"
                            : monthlySummary.statusTone === "danger"
                              ? "Revisar hoy"
                              : monthlySummary.statusLabel}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      ) : (
        <>
          <div className="students-mobile-list">
            {students.map((student) => {
              const outstanding = readOutstanding(student);
              const primaryGuardian = getPrimaryGuardian(student);
              const categoryLabel = getCategoryLabel(student.notes);
              const mainContact =
                primaryGuardian?.guardian.phone ??
                primaryGuardian?.guardian.email ??
                "Sin contacto";

              return (
                <article key={`mobile-${student.id}`} className="students-mobile-card">
                  <div className="students-mobile-card-top">
                    <div className="students-mobile-card-copy">
                      <div className="cell-title">{student.fullName}</div>
                      <div className="cell-subtitle">
                        {student.externalCode ?? "Sin código interno"} | cuota{" "}
                        {student.monthlyFeeCents
                          ? formatCurrencyFromCents(student.monthlyFeeCents)
                          : "sin definir"}
                      </div>
                    </div>
                    <span className={`pill ${student.active ? "success" : "neutral"}`}>
                      {student.active ? "Activo" : "Inactivo"}
                    </span>
                  </div>

                  <div className="students-mobile-grid">
                    <div className="students-mobile-item">
                      <span className="students-mobile-label">Categoría</span>
                      <strong>{categoryLabel}</strong>
                      <span className="table-secondary">Día de cobro {student.billingDay}</span>
                    </div>

                    <div className="students-mobile-item">
                      <span className="students-mobile-label">Apoderado</span>
                      <strong>{primaryGuardian?.guardian.fullName ?? "Sin apoderado"}</strong>
                      <span className="table-secondary">
                        {primaryGuardian ? primaryGuardian.relationship : "Sin responsable"}
                      </span>
                    </div>

                    <div className="students-mobile-item">
                      <span className="students-mobile-label">Contacto</span>
                      <strong>{mainContact}</strong>
                      <span className="table-secondary">
                        {getContactChannelLabel(primaryGuardian?.guardian.preferredChannel)}
                      </span>
                    </div>

                    <div className="students-mobile-item">
                      <span className="students-mobile-label">Estado</span>
                      <span className={`pill ${student.active ? "success" : "neutral"}`}>
                        {student.active ? "Activo" : "Inactivo"}
                      </span>
                      <span className="table-secondary">
                        {student.active ? "Disponible para cobro" : "Fuera de operación"}
                      </span>
                    </div>

                    <div className="students-mobile-item">
                      <span className="students-mobile-label">Saldo abierto</span>
                      <strong>{formatCurrencyFromCents(outstanding)}</strong>
                      <span className="table-secondary">
                        {outstanding > 0 ? "Requiere seguimiento" : "Cuenta al día"}
                      </span>
                    </div>
                  </div>

                  <div className="students-mobile-footer">
                    <Link
                      href={`/app/students/${student.id}`}
                      className="table-link table-link-primary students-mobile-action"
                      aria-label={`Ver detalle de ${student.fullName}`}
                      title={`Ver detalle de ${student.fullName}`}
                    >
                      Ver detalle
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>

          <table className="data-table students-master-table">
          <thead>
            <tr>
              <th>Alumno</th>
              <th>Categoría</th>
              <th>Apoderado</th>
              <th>{isMonthlyMode ? "Estado del mes" : "Contacto"}</th>
              <th>{isMonthlyMode ? "Facturado" : "Estado"}</th>
              <th>{isMonthlyMode ? "Pendiente" : "Saldo abierto"}</th>
              <th>{isMonthlyMode ? "Seguimiento" : "Acción"}</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => {
              const outstanding = readOutstanding(student);
              const primaryGuardian = getPrimaryGuardian(student);
              const categoryLabel = getCategoryLabel(student.notes);
              const monthlySummary = readMonthlyChargeSummary(student, props.reviewPeriod);
              const mainContact =
                primaryGuardian?.guardian.phone ??
                primaryGuardian?.guardian.email ??
                "Sin contacto";

              return (
                <tr key={student.id}>
                  <td>
                    <div className="cell-title">{student.fullName}</div>
                    <div className="cell-subtitle">
                      {student.externalCode ?? "Sin código interno"} | cuota{" "}
                      {student.monthlyFeeCents
                        ? formatCurrencyFromCents(student.monthlyFeeCents)
                        : "sin definir"}
                    </div>
                  </td>
                  <td>
                    <div className="table-primary">{categoryLabel}</div>
                    <div className="table-secondary">Día de cobro {student.billingDay}</div>
                  </td>
                  <td>
                    <div className="cell-title">{primaryGuardian?.guardian.fullName ?? "Sin apoderado"}</div>
                    <div className="cell-subtitle">
                      {primaryGuardian ? primaryGuardian.relationship : "Sin responsable"}
                    </div>
                  </td>

                  {isMonthlyMode ? (
                    <>
                      <td>
                        <StatusBadge label={monthlySummary.statusLabel} tone={monthlySummary.statusTone} />
                        <div className="table-secondary">
                          {monthlySummary.hasCharge
                            ? `Facturado ${formatCurrencyFromCents(monthlySummary.billedCents)}`
                            : "No hay cargo emitido para este mes"}
                        </div>
                      </td>
                      <td>
                        <span className="pill neutral">
                          {formatCurrencyFromCents(monthlySummary.billedCents)}
                        </span>
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
                        <span
                          className={`pill ${
                            !monthlySummary.hasCharge
                              ? "neutral"
                              : monthlySummary.isConsolidated
                                ? "success"
                                : monthlySummary.statusTone === "danger"
                                  ? "danger"
                                  : "warning"
                          }`}
                        >
                          {!monthlySummary.hasCharge
                            ? "Sin cargo"
                            : monthlySummary.isConsolidated
                              ? "Al día"
                              : monthlySummary.statusTone === "danger"
                                ? "Revisar hoy"
                                : monthlySummary.statusLabel}
                        </span>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>
                        <div className="cell-title">{mainContact}</div>
                        <div className="cell-subtitle">
                          {getContactChannelLabel(primaryGuardian?.guardian.preferredChannel)}
                        </div>
                      </td>
                      <td>
                        <span className={`pill ${student.active ? "success" : "neutral"}`}>
                          {student.active ? "Activo" : "Inactivo"}
                        </span>
                        <div className="table-secondary">
                          {student.active ? "Disponible para cobro" : "Fuera de operación"}
                        </div>
                      </td>
                      <td>
                        <span className={`pill ${outstanding > 0 ? "warning" : "success"}`}>
                          {formatCurrencyFromCents(outstanding)}
                        </span>
                        <div className="table-secondary">
                          {outstanding > 0 ? "Requiere seguimiento" : "Cuenta al día"}
                        </div>
                      </td>
                      <td>
                        <div className="student-row-actions student-row-actions-inline">
                          <Link
                            href={`/app/students/${student.id}`}
                            className="table-link table-link-primary"
                            aria-label={`Ver detalle de ${student.fullName}`}
                            title={`Ver detalle de ${student.fullName}`}
                          >
                            Ver detalle
                          </Link>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        </>
      )}
    </article>
  );
}
