"use client";

import { ContactChannel } from "@prisma/client";
import { startTransition, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
    outstandingCents: number;
  }>;
};

type GuardianOption = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  preferredChannel: ContactChannel;
  students: Array<{
    isPrimary: boolean;
    relationship: string;
    student: {
      id: string;
      fullName: string;
    };
  }>;
};

type ApiResponse<T> = {
  data?: T;
  error?: string;
};

type GuardianMode = "upsert" | "existing";

const relationshipOptions = ["Madre", "Padre", "Tutor", "Apoderado", "Otro"];
const categoryOptions = ["sub-6", "sub-8", "sub-10", "sub-12", "sub-14", "sub-16", "adultos"];

const currencyFormatter = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0
});

function formatCurrencyFromCents(amountCents: number) {
  return currencyFormatter.format(amountCents / 100);
}

function getPrimaryGuardian(student: StudentRow) {
  return student.guardians.find((relation) => relation.isPrimary) ?? student.guardians[0] ?? null;
}

function readOutstanding(student: StudentRow) {
  return student.charges.reduce((total, charge) => total + charge.outstandingCents, 0);
}

export function StudentUpsertForm(props: {
  guardianOptions: GuardianOption[];
  initialStudent?: StudentRow;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [monthlyFee, setMonthlyFee] = useState("");
  const [billingDay, setBillingDay] = useState("10");
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);
  const [guardianMode, setGuardianMode] = useState<GuardianMode>("upsert");
  const [currentGuardianId, setCurrentGuardianId] = useState<string | undefined>(undefined);
  const [selectedGuardianId, setSelectedGuardianId] = useState("");
  const [guardianFullName, setGuardianFullName] = useState("");
  const [guardianRelationship, setGuardianRelationship] = useState("Madre");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [preferredChannel, setPreferredChannel] = useState<ContactChannel>(ContactChannel.WHATSAPP);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"success" | "danger">("success");

  const isEditing = Boolean(props.initialStudent);
  const editingStudent = props.initialStudent ?? null;
  const editingPrimaryGuardian = editingStudent ? getPrimaryGuardian(editingStudent) : null;
  const selectedExistingGuardian =
    props.guardianOptions.find((guardian) => guardian.id === selectedGuardianId) ?? null;

  useEffect(() => {
    if (!props.initialStudent) {
      setFullName("");
      setMonthlyFee("");
      setBillingDay("10");
      setNotes("");
      setActive(true);
      setGuardianMode("upsert");
      setCurrentGuardianId(undefined);
      setSelectedGuardianId("");
      setGuardianFullName("");
      setGuardianRelationship("Madre");
      setGuardianPhone("");
      setGuardianEmail("");
      setPreferredChannel(ContactChannel.WHATSAPP);
      setMessage(null);
      return;
    }

    const primaryGuardian = getPrimaryGuardian(props.initialStudent);
    setFullName(props.initialStudent.fullName);
    setMonthlyFee(
      props.initialStudent.monthlyFeeCents
        ? String(Math.round(props.initialStudent.monthlyFeeCents / 100))
        : ""
    );
    setBillingDay(String(props.initialStudent.billingDay));
    setNotes(props.initialStudent.notes ?? "");
    setActive(props.initialStudent.active);
    setGuardianMode("upsert");
    setCurrentGuardianId(primaryGuardian?.guardian.id);
    setSelectedGuardianId("");
    setGuardianFullName(primaryGuardian?.guardian.fullName ?? "");
    setGuardianRelationship(primaryGuardian?.relationship ?? "Apoderado");
    setGuardianPhone(primaryGuardian?.guardian.phone ?? "");
    setGuardianEmail(primaryGuardian?.guardian.email ?? "");
    setPreferredChannel(primaryGuardian?.guardian.preferredChannel ?? ContactChannel.WHATSAPP);
    setMessage(null);
  }, [props.initialStudent]);

  function validateForm() {
    if (fullName.trim().length < 3) {
      setTone("danger");
      setMessage("El alumno debe tener al menos 3 caracteres en el nombre.");
      return false;
    }

    const monthlyFeeValue = Number(monthlyFee);
    if (!Number.isInteger(monthlyFeeValue) || monthlyFeeValue <= 0) {
      setTone("danger");
      setMessage("Debes ingresar una cuota mensual válida en pesos.");
      return false;
    }

    const billingDayValue = Number(billingDay);
    if (!Number.isInteger(billingDayValue) || billingDayValue < 1 || billingDayValue > 28) {
      setTone("danger");
      setMessage("El día de cobro debe estar entre 1 y 28.");
      return false;
    }

    if (guardianRelationship.trim().length < 2) {
      setTone("danger");
      setMessage("Debes indicar la relación del apoderado.");
      return false;
    }

    if (guardianMode === "existing" && !selectedGuardianId) {
      setTone("danger");
      setMessage("Selecciona un apoderado existente.");
      return false;
    }

    if (guardianMode === "upsert") {
      if (guardianFullName.trim().length < 3) {
        setTone("danger");
        setMessage("El apoderado principal debe tener un nombre válido.");
        return false;
      }

      if (!guardianPhone.trim() && !guardianEmail.trim()) {
        setTone("danger");
        setMessage("El apoderado debe tener al menos teléfono o correo.");
        return false;
      }

      if (guardianPhone.trim() && !/^\+?[0-9()\s-]{8,20}$/.test(guardianPhone.trim())) {
        setTone("danger");
        setMessage("Ingresa un teléfono válido para el apoderado.");
        return false;
      }

      if (
        guardianEmail.trim() &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guardianEmail.trim().toLowerCase())
      ) {
        setTone("danger");
        setMessage("Ingresa un correo válido para el apoderado.");
        return false;
      }
    }

    return true;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!validateForm()) {
      return;
    }

    setSaving(true);

    const body = {
      fullName: fullName.trim(),
      monthlyFeeCents: Number(monthlyFee) * 100,
      billingDay: Number(billingDay),
      notes: notes.trim() ? notes.trim() : null,
      active,
      guardian:
        guardianMode === "existing"
          ? {
              mode: "existing" as const,
              guardianId: selectedGuardianId,
              relationship: guardianRelationship.trim()
            }
          : {
              mode: "upsert" as const,
              guardianId: currentGuardianId,
              fullName: guardianFullName.trim(),
              relationship: guardianRelationship.trim(),
              phone: guardianPhone.trim() ? guardianPhone.trim() : null,
              email: guardianEmail.trim() ? guardianEmail.trim().toLowerCase() : null,
              preferredChannel
            }
    };

    const endpoint = isEditing
      ? `/api/v1/students/${props.initialStudent?.id}`
      : "/api/v1/students";
    const method = isEditing ? "PATCH" : "POST";

    try {
      const response = await fetch(endpoint, {
        method,
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(body)
      });
      const payload = (await response.json()) as ApiResponse<StudentRow>;

      if (!response.ok) {
        setTone("danger");
        setMessage(payload.error ?? "No se pudo guardar el alumno.");
        return;
      }

      setTone("success");
      setMessage(isEditing ? "Alumno actualizado correctamente." : "Alumno creado correctamente.");
      startTransition(() => {
        router.push("/app/students");
        router.refresh();
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="app-card stack student-crud-card">
      <div className="section-copy">
        <span className="eyebrow">CRUD de alumnos</span>
        <h2 className="card-title">{isEditing ? "Editar alumno" : "Registrar alumno"}</h2>
        <p className="section-description compact">
          El alumno necesita un apoderado principal operativo. Los cargos y la deuda se calculan
          desde cobranzas, por eso aquí se muestran como lectura y no como campos editables.
        </p>
      </div>

      {isEditing && editingStudent ? (
        <div className="student-summary-grid">
          <div className="student-summary-card">
            <span className="stat-chip-label">Apoderado principal</span>
            <strong>{editingPrimaryGuardian?.guardian.fullName ?? "Sin apoderado"}</strong>
            {editingPrimaryGuardian?.relationship ?? "Debes completar este dato"}
          </div>
          <div className="student-summary-card">
            <span className="stat-chip-label">Cuota mensual</span>
            <strong>
              {editingStudent.monthlyFeeCents
                ? formatCurrencyFromCents(editingStudent.monthlyFeeCents)
                : "Sin definir"}
            </strong>
            Vence el día {editingStudent.billingDay} de cada mes.
          </div>
          <div className="student-summary-card">
            <span className="stat-chip-label">Cargos vigentes</span>
            <strong>{editingStudent.charges.length}</strong>
            Registros financieros asociados al alumno.
          </div>
          <div className="student-summary-card">
            <span className="stat-chip-label">Deuda abierta</span>
            <strong>{formatCurrencyFromCents(readOutstanding(editingStudent))}</strong>
            Calculada automáticamente desde los cargos.
          </div>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="stack">
        <div className="form-grid">
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="student-full-name">Nombre completo del alumno</label>
            <input
              id="student-full-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Ejemplo: Ignacio Perez"
              required
            />
            <span className="helper-text">
              Usa nombre y apellido para mantener el listado alineado y fácil de buscar.
            </span>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="student-monthly-fee">Cuota mensual</label>
            <input
              id="student-monthly-fee"
              inputMode="numeric"
              value={monthlyFee}
              onChange={(event) => setMonthlyFee(event.target.value.replace(/\D/g, ""))}
              placeholder="Ejemplo: 24170"
              required
            />
            <span className="helper-text">
              Valor mensual en pesos. Este monto genera la deuda inicial del alumno.
            </span>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="student-billing-day">Día de cobro</label>
            <input
              id="student-billing-day"
              inputMode="numeric"
              value={billingDay}
              onChange={(event) => setBillingDay(event.target.value.replace(/\D/g, ""))}
              placeholder="10"
              required
            />
            <span className="helper-text">
              Día del mes en que vence la mensualidad. Usa un valor entre 1 y 28.
            </span>
          </div>
        </div>

        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="student-notes">Categoría</label>
          <select
            id="student-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            required
          >
            <option value="">Selecciona una categoría</option>
            {categoryOptions.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <span className="helper-text">
            Selecciona la categoría del alumno para mantener el registro ordenado.
          </span>
        </div>

        <section className="student-guardian-panel">
          <div className="section-copy">
            <span className="eyebrow">Apoderado principal</span>
            <h3 className="card-title student-subtitle">Responsable de contacto y cobranza</h3>
            <p className="section-description compact">
              Cada alumno debe quedar asociado a un apoderado principal para contacto y
              conciliación de pagos.
            </p>
          </div>

          <div className="student-guardian-mode">
            <label className="student-option-card" htmlFor="guardian-mode-upsert">
              <input
                id="guardian-mode-upsert"
                type="radio"
                name="guardian-mode"
                checked={guardianMode === "upsert"}
                onChange={() => setGuardianMode("upsert")}
              />
              Crear o editar apoderado principal
            </label>
            <label className="student-option-card" htmlFor="guardian-mode-existing">
              <input
                id="guardian-mode-existing"
                type="radio"
                name="guardian-mode"
                checked={guardianMode === "existing"}
                onChange={() => setGuardianMode("existing")}
              />
              Vincular apoderado existente
            </label>
          </div>

          <div className="form-grid">
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="guardian-relationship">Relación con el alumno</label>
              <select
                id="guardian-relationship"
                value={guardianRelationship}
                onChange={(event) => setGuardianRelationship(event.target.value)}
              >
                {relationshipOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            {guardianMode === "existing" ? (
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="guardian-existing">Apoderado registrado</label>
                <select
                  id="guardian-existing"
                  value={selectedGuardianId}
                  onChange={(event) => setSelectedGuardianId(event.target.value)}
                >
                  <option value="">Selecciona un apoderado</option>
                  {props.guardianOptions.map((guardian) => (
                    <option key={guardian.id} value={guardian.id}>
                      {guardian.fullName}
                      {guardian.phone ? ` - ${guardian.phone}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="guardian-full-name">Nombre del apoderado</label>
                <input
                  id="guardian-full-name"
                  value={guardianFullName}
                  onChange={(event) => setGuardianFullName(event.target.value)}
                  placeholder="Ejemplo: Andrea Perez"
                />
              </div>
            )}
          </div>

          {guardianMode === "existing" ? (
            selectedExistingGuardian ? (
              <div className="student-existing-guardian">
                <strong>{selectedExistingGuardian.fullName}</strong>
                <span>
                  {selectedExistingGuardian.phone || "Sin teléfono"} ·{" "}
                  {selectedExistingGuardian.email || "Sin correo"}
                </span>
                <span>
                  {selectedExistingGuardian.students.length > 0
                    ? `Ya vinculado a ${selectedExistingGuardian.students.length} alumno(s).`
                    : "Disponible para vincular."}
                </span>
              </div>
            ) : null
          ) : (
            <div className="form-grid">
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="guardian-phone">Teléfono</label>
                <input
                  id="guardian-phone"
                  value={guardianPhone}
                  onChange={(event) => setGuardianPhone(event.target.value)}
                  placeholder="+56912345678"
                />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="guardian-email">Correo</label>
                <input
                  id="guardian-email"
                  type="email"
                  value={guardianEmail}
                  onChange={(event) => setGuardianEmail(event.target.value)}
                  placeholder="apoderado@correo.cl"
                />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="guardian-channel">Canal preferido</label>
                <select
                  id="guardian-channel"
                  value={preferredChannel}
                  onChange={(event) => setPreferredChannel(event.target.value as ContactChannel)}
                >
                  <option value={ContactChannel.WHATSAPP}>WhatsApp</option>
                  <option value={ContactChannel.TELEGRAM}>Telegram</option>
                  <option value={ContactChannel.EMAIL}>Email</option>
                </select>
              </div>
            </div>
          )}
        </section>

        {isEditing ? (
          <label className="student-active-toggle" htmlFor="student-active">
            <input
              id="student-active"
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
            />
            Alumno activo
          </label>
        ) : null}

        {message ? <span className={`form-feedback ${tone}`}>{message}</span> : null}

        <div className="toolbar-actions">
          <button className="button button-small" type="submit" disabled={saving}>
            {saving
              ? isEditing
                ? "Guardando cambios..."
                : "Creando alumno..."
              : isEditing
                ? "Guardar cambios"
                : "Crear alumno"}
          </button>
          <Link className="button-secondary button-small" href="/app/students">
            Volver a alumnos
          </Link>
        </div>
      </form>
    </article>
  );
}
