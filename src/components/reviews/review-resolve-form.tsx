"use client";

import { useState } from "react";

export function ReviewResolveForm(props: { reviewId: string; defaultChargeId?: string }) {
  const [chargeId, setChargeId] = useState(props.defaultChargeId ?? "");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    const response = await fetch(`/api/v1/reviews/${props.reviewId}/resolve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chargeId, resolutionNotes })
    });

    const payload = (await response.json()) as { error?: string };
    setSaving(false);

    if (!response.ok) {
      setMessage(payload.error ?? "No se pudo resolver la revisión");
      return;
    }

    setMessage("La revisión se resolvió correctamente.");
    window.location.reload();
  }

  return (
    <form onSubmit={handleSubmit} className="stack review-form">
      <div className="form-grid">
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor={`charge-${props.reviewId}`}>Cargo a confirmar</label>
          <input
            id={`charge-${props.reviewId}`}
            value={chargeId}
            onChange={(event) => setChargeId(event.target.value)}
            placeholder="Pega el ID del cargo validado"
          />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor={`notes-${props.reviewId}`}>Notas de resolución</label>
          <textarea
            id={`notes-${props.reviewId}`}
            value={resolutionNotes}
            onChange={(event) => setResolutionNotes(event.target.value)}
            placeholder="Explica por qué confirmas este cargo o deja una observación para trazabilidad."
            rows={3}
          />
        </div>
      </div>
      {message ? <span className="form-feedback success">{message}</span> : null}
      <div className="action-row">
        <button className="button" disabled={saving || !chargeId} type="submit">
          {saving ? "Confirmando conciliación..." : "Confirmar conciliación"}
        </button>
      </div>
    </form>
  );
}
