"use client";

import { OnboardingPlan } from "@prisma/client";
import { useState } from "react";

type ApiResponse<T> = {
  data?: T;
  error?: string;
};

type OnboardingInstructions = {
  amountCents: number;
  amountLabel: string;
  referenceCode: string;
  academyName: string;
  telegramLink: string | null;
  steps: string[];
};

type CreatedOnboardingPayload = {
  request: {
    id: string;
    plan: OnboardingPlan;
  };
  instructions: OnboardingInstructions;
};

const planOptions = [
  {
    value: OnboardingPlan.SEMILLERO,
    label: "Semillero",
    description: "Hasta 40 familias activas y punto de entrada mas rapido."
  },
  {
    value: OnboardingPlan.ACADEMIA,
    label: "Academia",
    description: "Para escuelas en crecimiento con mas control operativo."
  },
  {
    value: OnboardingPlan.CLUB_PRO,
    label: "Club Pro",
    description: "Para estructuras mas grandes y sedes multiples."
  }
];

type OnboardingFormState = {
  fullName: string;
  academyName: string;
  email: string;
  phone: string;
  city: string;
  notes: string;
  plan: OnboardingPlan;
};

export function OnboardingRequestForm() {
  const [form, setForm] = useState<OnboardingFormState>({
    fullName: "",
    academyName: "",
    email: "",
    phone: "",
    city: "",
    notes: "",
    plan: OnboardingPlan.SEMILLERO
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedOnboardingPayload | null>(null);

  const selectedPlan = planOptions.find((option) => option.value === form.plan) ?? planOptions[0]!;

  function updateField<K extends keyof OnboardingFormState>(field: K, value: OnboardingFormState[K]) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/v1/onboarding/requests", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(form)
      });

      const payload = (await response.json()) as ApiResponse<CreatedOnboardingPayload>;
      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? "No pudimos crear la solicitud de alta.");
      }

      setCreated(payload.data);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Ocurrio un error inesperado al crear la solicitud."
      );
    } finally {
      setSaving(false);
    }
  }

  if (created) {
    return (
      <section className="login-card stack onboarding-success-card">
        <span className="eyebrow">Solicitud creada</span>
        <h2 className="app-title" style={{ fontSize: "2.15rem" }}>
          Tu academia quedo lista para validacion.
        </h2>
        <p className="muted">
          Guarda este codigo y usa el boton de Telegram para enviar el comprobante del Pre-calentamiento.
        </p>

        <div className="onboarding-code-row">
          <div className="student-summary-card">
            <span className="stat-chip-label">Codigo</span>
            <strong>{created.instructions.referenceCode}</strong>
            Identificador de tu solicitud.
          </div>
          <div className="student-summary-card">
            <span className="stat-chip-label">Monto</span>
            <strong>{created.instructions.amountLabel}</strong>
            Pre-calentamiento de activacion.
          </div>
        </div>

        <div className="app-card stack" style={{ padding: 20 }}>
          <span className="eyebrow">Pasos</span>
          {created.instructions.steps.map((step) => (
            <div key={step} className="performance-item">
              <div>
                <strong>{step}</strong>
                <span className="muted">{created.instructions.academyName}</span>
              </div>
            </div>
          ))}
        </div>

        {created.instructions.telegramLink ? (
          <a className="button button-block" href={created.instructions.telegramLink} target="_blank" rel="noreferrer">
            Abrir Telegram y enviar comprobante
          </a>
        ) : (
          <span className="form-feedback danger">
            Falta configurar el bot de onboarding para generar el acceso directo a Telegram.
          </span>
        )}

        <button
          className="button-secondary button-block"
          type="button"
          onClick={() => {
            setCreated(null);
            setError(null);
          }}
        >
          Crear otra solicitud
        </button>
      </section>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="login-card stack onboarding-form">
      <div className="stack" style={{ gap: 8 }}>
        <span className="eyebrow">Contratar ahora</span>
        <h2 className="app-title" style={{ fontSize: "2.25rem" }}>
          Alta rapida para tu escuela
        </h2>
        <p className="muted">
          Completa tus datos, paga el Pre-calentamiento y enviamos tu acceso apenas validemos el comprobante.
        </p>
      </div>

      <div className="form-grid">
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="onb-fullName">Nombre del director o profesor</label>
          <input
            id="onb-fullName"
            value={form.fullName}
            onChange={(event) => updateField("fullName", event.target.value)}
            placeholder="Ejemplo: Marcelo Pavez"
            required
          />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="onb-academyName">Academia o club</label>
          <input
            id="onb-academyName"
            value={form.academyName}
            onChange={(event) => updateField("academyName", event.target.value)}
            placeholder="Ejemplo: Pase Gol"
            required
          />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="onb-email">Correo de acceso</label>
          <input
            id="onb-email"
            type="email"
            value={form.email}
            onChange={(event) => updateField("email", event.target.value)}
            placeholder="director@academia.cl"
            required
          />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="onb-phone">WhatsApp</label>
          <input
            id="onb-phone"
            value={form.phone}
            onChange={(event) => updateField("phone", event.target.value)}
            placeholder="+56912345678"
            required
          />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="onb-city">Ciudad</label>
          <input
            id="onb-city"
            value={form.city}
            onChange={(event) => updateField("city", event.target.value)}
            placeholder="Santiago"
          />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="onb-plan">Plan</label>
          <select
            id="onb-plan"
            value={form.plan}
            onChange={(event) => updateField("plan", event.target.value as OnboardingPlan)}
          >
            {planOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="helper-text">{selectedPlan.description}</span>
        </div>
      </div>

      <div className="field" style={{ marginBottom: 0 }}>
        <label htmlFor="onb-notes">Contexto de tu escuela</label>
        <textarea
          id="onb-notes"
          rows={4}
          value={form.notes}
          onChange={(event) => updateField("notes", event.target.value)}
          placeholder="Cuantas familias manejas hoy, si cobras por WhatsApp o Telegram y cualquier detalle util."
        />
      </div>

      <div className="student-existing-guardian">
        <strong>Pre-calentamiento</strong>
        <span>
          Pagas una sola vez la activacion inicial. Luego validamos el comprobante y te enviamos un
          enlace de acceso por 1 hora para definir tu contrasena.
        </span>
      </div>

      {error ? <p className="form-feedback danger">{error}</p> : null}

      <button className="button button-block" type="submit" disabled={saving}>
        {saving ? "Creando solicitud..." : "Crear solicitud de alta"}
      </button>
    </form>
  );
}
