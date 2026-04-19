"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ManualDeliveryModalProps = {
  activationUrl: string;
  closeHref: string;
  publicCode: string;
  deliveryMode: "email" | "manual";
};

export function ManualDeliveryModal(props: ManualDeliveryModalProps) {
  const router = useRouter();
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  async function copyActivationLink() {
    try {
      await navigator.clipboard.writeText(props.activationUrl);
      setCopyFeedback("Enlace copiado. Ya puedes compartirlo manualmente.");
    } catch {
      setCopyFeedback("No pudimos copiar el enlace automaticamente.");
    }
  }

  function closeModal() {
    router.replace(props.closeHref as never);
    router.refresh();
  }

  return (
    <div className="onboarding-modal-backdrop" role="presentation" onClick={closeModal}>
      <section
        className="onboarding-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-delivery-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="onboarding-modal-header">
          <div className="stack" style={{ gap: 6 }}>
            <span className="eyebrow">Entrega manual</span>
            <h2 id="manual-delivery-title" className="app-title onboarding-panel-title">
              Acceso listo para compartir
            </h2>
          </div>
          <button className="button-secondary button-small" type="button" onClick={closeModal}>
            Cerrar
          </button>
        </div>

        <div className="stack onboarding-modal-body">
          <p className="muted">
            Solicitud <strong>{props.publicCode}</strong>. Este acceso vence en 1 hora desde su
            creacion.
          </p>
          <p className="muted">
            {props.deliveryMode === "email"
              ? "Tambien se envio el correo de activacion al cliente. Este modal queda como respaldo para entrega manual."
              : "No pudimos entregar el correo automaticamente. Comparte este enlace al cliente para completar la activacion."}
          </p>

          <div className="onboarding-modal-linkbox">
            <label htmlFor="manual-activation-link">Enlace de activacion</label>
            <textarea
              id="manual-activation-link"
              value={props.activationUrl}
              readOnly
              rows={4}
            />
          </div>

          <div className="onboarding-modal-actions">
            <button className="button" type="button" onClick={copyActivationLink}>
              Copiar enlace
            </button>
            <a
              href={props.activationUrl}
              className="button-secondary"
              target="_blank"
              rel="noreferrer"
            >
              Abrir enlace
            </a>
          </div>

          {copyFeedback ? <p className="form-feedback success">{copyFeedback}</p> : null}
        </div>
      </section>
    </div>
  );
}
