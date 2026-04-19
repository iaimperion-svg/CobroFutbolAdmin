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
  paymentDestination: {
    bankName: string;
    accountType: string;
    accountNumber: string;
    holderName: string;
    holderRut: string | null;
    transferEmail: string | null;
    configured: boolean;
  };
  steps: string[];
};

type CreatedOnboardingPayload = {
  request: {
    id: string;
    plan: OnboardingPlan;
  };
  instructions: OnboardingInstructions;
  delivery: {
    delivered: boolean;
    mode: "email" | "manual";
  };
};

const planOptions = [
  {
    value: OnboardingPlan.SEMILLERO,
    label: "Semillero",
    description: "Hasta 100 alumnos y punto de entrada mas rapido."
  },
  {
    value: OnboardingPlan.ACADEMIA,
    label: "Academia",
    description: "Hasta 300 alumnos con mas control operativo."
  },
  {
    value: OnboardingPlan.CLUB_PRO,
    label: "Club Pro",
    description: "Mas de 300 alumnos para estructuras mas grandes."
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

function createInitialFormState(initialPlan?: OnboardingPlan): OnboardingFormState {
  return {
    fullName: "",
    academyName: "",
    email: "",
    phone: "",
    city: "",
    notes: "",
    plan: initialPlan ?? OnboardingPlan.SEMILLERO
  };
}

export function OnboardingRequestForm(props: {
  initialPlan?: OnboardingPlan;
  onCurrentStepChange?: (step: 1 | 2) => void;
}) {
  const [form, setForm] = useState<OnboardingFormState>(() => createInitialFormState(props.initialPlan));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedOnboardingPayload | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const selectedPlan = planOptions.find((option) => option.value === form.plan) ?? planOptions[0]!;

  function updateField<K extends keyof OnboardingFormState>(field: K, value: OnboardingFormState[K]) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function resetForm() {
    setForm(createInitialFormState(props.initialPlan));
    setError(null);
    setActionFeedback(null);
    props.onCurrentStepChange?.(1);
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
      setActionFeedback(null);
      props.onCurrentStepChange?.(2);
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

  function openTelegramLink(url: string) {
    setActionFeedback(null);
    window.location.assign(url);
  }

  async function copyTelegramLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setActionFeedback("Enlace de Telegram copiado. Pegalo en el navegador si no se abre automaticamente.");
    } catch {
      setActionFeedback("No pudimos copiar el enlace. Intenta abrirlo de nuevo desde este boton.");
    }
  }

  async function copyTransferBlock(paymentDestination: OnboardingInstructions["paymentDestination"]) {
    const transferBlock = [
      "DATOS DE TRANSFERENCIA",
      `Banco: ${paymentDestination.bankName}`,
      `Tipo de cuenta: ${paymentDestination.accountType}`,
      `Numero de cuenta: ${paymentDestination.accountNumber}`,
      `Titular: ${paymentDestination.holderName}`,
      `Correo de transferencia: ${paymentDestination.transferEmail ?? "Sin correo"}`,
      `RUT: ${paymentDestination.holderRut ?? "Sin RUT"}`
    ].join("\n");

    try {
      await navigator.clipboard.writeText(transferBlock);
      setActionFeedback("Datos de transferencia copiados completos.");
    } catch {
      setActionFeedback("No pudimos copiar el bloque de transferencia.");
    }
  }

  if (created) {
    const paymentDestination = created.instructions.paymentDestination;

    return (
      <section className="login-card stack onboarding-success-card onboarding-panel">
        <div className="stack onboarding-card-header">
          <span className="eyebrow">Solicitud creada</span>
          <h2 className="app-title onboarding-panel-title">Tu academia quedo lista para validacion.</h2>
          <p className="muted">
            Guarda este codigo y continua desde Telegram para enviar el comprobante del pre-calentamiento.
          </p>
          <p className="muted">
            {created.delivery.delivered
              ? `Tambien enviamos el enlace del bot al correo ${form.email}.`
              : `Si sales de esta pagina, conserva el codigo ${created.instructions.referenceCode} para retomar el acceso al bot.`}
          </p>
        </div>

        <div className="onboarding-inline-meta">
          <div className="onboarding-kv-card">
            <span>Codigo</span>
            <strong>{created.instructions.referenceCode}</strong>
          </div>
          <div className="onboarding-kv-card">
            <span>Monto</span>
            <strong>{created.instructions.amountLabel}</strong>
          </div>
        </div>

        <section className="onboarding-section stack">
          <span className="eyebrow">Siguiente paso</span>
          <div className="onboarding-compact-list">
            {created.instructions.steps.map((step) => (
              <div key={step} className="onboarding-list-row">
                <strong>{step}</strong>
                <span>{created.instructions.academyName}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="onboarding-section stack">
          <div className="onboarding-transfer-card-header">
            <span className="eyebrow">Datos de transferencia</span>
            {paymentDestination.configured ? (
              <button
                className="button-secondary onboarding-inline-button"
                type="button"
                onClick={() => copyTransferBlock(paymentDestination)}
              >
                Copiar bloque
              </button>
            ) : null}
          </div>
          {paymentDestination.configured ? (
            <div className="onboarding-transfer-card">
              <div className="onboarding-transfer-list">
                <div className="onboarding-transfer-row">
                  <span>Banco</span>
                  <div>
                    <strong>{paymentDestination.bankName}</strong>
                    <small>{paymentDestination.accountType}</small>
                  </div>
                </div>
                <div className="onboarding-transfer-row">
                  <span>Cuenta</span>
                  <div>
                    <strong>{paymentDestination.accountNumber}</strong>
                    <small>Numero para la transferencia</small>
                  </div>
                </div>
                <div className="onboarding-transfer-row">
                  <span>Titular</span>
                  <div>
                    <strong>{paymentDestination.holderName}</strong>
                    <small>{paymentDestination.holderRut ?? "Sin RUT"}</small>
                  </div>
                </div>
                <div className="onboarding-transfer-row">
                  <span>Correo</span>
                  <div>
                    <strong>{paymentDestination.transferEmail ?? "Sin correo"}</strong>
                    <small>Usalo al momento de transferir</small>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="form-feedback danger" style={{ margin: 0 }}>
              Faltan configurar los datos de transferencia del onboarding antes de usar este flujo con clientes reales.
            </p>
          )}
        </section>

        <div className="onboarding-actions-stack onboarding-actions-row">
          {created.instructions.telegramLink ? (
            <>
              <button
                className="button onboarding-inline-action"
                type="button"
                onClick={() => openTelegramLink(created.instructions.telegramLink!)}
              >
                Abrir Telegram
              </button>
              <button
                className="button-secondary onboarding-inline-action"
                type="button"
                onClick={() => copyTelegramLink(created.instructions.telegramLink!)}
              >
                Copiar enlace
              </button>
            </>
          ) : (
            <span className="form-feedback danger">
              Falta configurar el bot de onboarding para generar el acceso directo a Telegram.
            </span>
          )}

          <button
            className="button-secondary onboarding-inline-action"
            type="button"
            onClick={() => {
              setCreated(null);
              resetForm();
            }}
          >
            Nueva solicitud
          </button>
        </div>

        {actionFeedback ? <p className="form-feedback success">{actionFeedback}</p> : null}
      </section>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="login-card stack onboarding-form onboarding-form-shell onboarding-panel onboarding-material-panel"
    >
      <div className="stack onboarding-card-header">
        <span className="eyebrow">Formulario</span>
        <h2 className="app-title onboarding-form-title">
          Inicia tu academia en <span className="onboarding-form-title-accent">CobroFutbol</span>
        </h2>
        <p className="muted onboarding-form-copy">
          Completa la informacion principal y generaremos la solicitud para continuar con el proceso.
        </p>
      </div>

      <div className="form-grid onboarding-material-grid">
        <div className="field onboarding-material-field">
          <label htmlFor="onb-fullName">Nombre del director o profesor</label>
          <input
            id="onb-fullName"
            value={form.fullName}
            onChange={(event) => updateField("fullName", event.target.value)}
            placeholder="Ejemplo: Marcelo Pavez"
            required
          />
        </div>
        <div className="field onboarding-material-field">
          <label htmlFor="onb-academyName">Academia o club</label>
          <input
            id="onb-academyName"
            value={form.academyName}
            onChange={(event) => updateField("academyName", event.target.value)}
            placeholder="Ejemplo: Pase Gol"
            required
          />
        </div>
        <div className="field onboarding-material-field">
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
        <div className="field onboarding-material-field">
          <label htmlFor="onb-phone">WhatsApp</label>
          <input
            id="onb-phone"
            value={form.phone}
            onChange={(event) => updateField("phone", event.target.value)}
            placeholder="+56912345678"
            required
          />
        </div>
        <div className="field onboarding-material-field">
          <label htmlFor="onb-city">Ciudad</label>
          <input
            id="onb-city"
            value={form.city}
            onChange={(event) => updateField("city", event.target.value)}
            placeholder="Santiago"
          />
        </div>
        <div className="field onboarding-material-field">
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

      <div className="field onboarding-material-field onboarding-material-field-wide">
        <label htmlFor="onb-notes">Contexto de tu escuela</label>
        <textarea
          id="onb-notes"
          rows={3}
          value={form.notes}
          onChange={(event) => updateField("notes", event.target.value)}
          placeholder="Cuantos alumnos manejas hoy, si cobras por WhatsApp o Telegram y cualquier detalle util."
        />
      </div>

      <div className="onboarding-note onboarding-material-note">
        <strong>Siguiente paso</strong>
        <span>
          Al enviar esta solicitud te mostraremos las instrucciones y enviaremos el acceso al bot a tu correo.
        </span>
      </div>

      {error ? <p className="form-feedback danger">{error}</p> : null}

      <button className="button button-block onboarding-primary-button" type="submit" disabled={saving}>
        {saving ? "Creando solicitud..." : "Crear solicitud de alta"}
      </button>
    </form>
  );
}
