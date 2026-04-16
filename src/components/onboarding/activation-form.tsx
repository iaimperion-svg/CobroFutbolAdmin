"use client";

import Link from "next/link";
import { useState } from "react";

type ActivationSnapshot = {
  academyName: string;
  fullName: string;
  expiresAt: Date | string;
} | null;

type ApiResponse<T> = {
  data?: T;
  error?: string;
};

export function ActivationForm(props: {
  token: string;
  snapshot: ActivationSnapshot;
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activated, setActivated] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 10) {
      setError("La contrasena debe tener al menos 10 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contrasenas no coinciden.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/v1/onboarding/activation", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          token: props.token,
          password
        })
      });

      const payload = (await response.json()) as ApiResponse<{ activated: boolean }>;
      if (!response.ok) {
        throw new Error(payload.error ?? "No pudimos activar tu cuenta.");
      }

      setActivated(true);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Ocurrio un error inesperado."
      );
    } finally {
      setSaving(false);
    }
  }

  if (!props.snapshot) {
    return (
      <section className="login-card stack onboarding-form">
        <span className="eyebrow">Activacion vencida</span>
        <h1 className="app-title">El enlace ya no esta disponible.</h1>
        <p className="muted">
          Pidele al equipo de onboarding que te reenvie un nuevo acceso para completar el alta.
        </p>
      </section>
    );
  }

  if (activated) {
    return (
      <section className="login-card stack onboarding-success-card">
        <span className="eyebrow">Cuenta activada</span>
        <h1 className="app-title">Tu acceso ya quedo listo.</h1>
        <p className="muted">
          La academia <strong>{props.snapshot.academyName}</strong> ya puede entrar al portal.
        </p>
        <Link href="/login" className="button button-block">
          Ir al login
        </Link>
      </section>
    );
  }

  const expiryLabel = new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(props.snapshot.expiresAt));

  return (
    <form onSubmit={handleSubmit} className="login-card stack onboarding-form">
      <div className="stack" style={{ gap: 8 }}>
        <span className="eyebrow">Activacion final</span>
        <h1 className="app-title">Define tu contrasena de acceso.</h1>
        <p className="muted">
          {props.snapshot.fullName}, estas activando <strong>{props.snapshot.academyName}</strong>.
          Este enlace vence el {expiryLabel}.
        </p>
      </div>

      <div className="field" style={{ marginBottom: 0 }}>
        <label htmlFor="activation-password">Nueva contrasena</label>
        <input
          id="activation-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Minimo 10 caracteres"
        />
      </div>

      <div className="field" style={{ marginBottom: 0 }}>
        <label htmlFor="activation-confirm">Repite la contrasena</label>
        <input
          id="activation-confirm"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="Repite tu contrasena"
        />
      </div>

      {error ? <p className="form-feedback danger">{error}</p> : null}

      <button className="button button-block" type="submit" disabled={saving}>
        {saving ? "Activando acceso..." : "Activar mi cuenta"}
      </button>
    </form>
  );
}
