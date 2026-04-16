import { BrandMark } from "@/components/brand/brand-mark";
import { OnboardingRequestForm } from "@/components/onboarding/onboarding-request-form";

export default function OnboardingPage() {
  return (
    <main className="login-wrap">
      <section className="login-grid onboarding-grid">
        <article className="login-card stack">
          <BrandMark
            src="/brand/logo_.png"
            trimTransparentPadding={false}
            subtitle="Alta guiada para academias y clubes"
          />
          <span className="eyebrow">Nuevo onboarding</span>
          <h1 className="app-title">Pasa de interes comercial a portal activo en un flujo claro.</h1>
          <p className="muted">
            Creamos la solicitud, validamos tu comprobante por Telegram y te enviamos un enlace
            temporal para definir la contrasena de acceso.
          </p>

          <div className="badge-row">
            <div className="stat-chip">
              <strong>1.</strong>
              Solicitud y datos del director.
            </div>
            <div className="stat-chip">
              <strong>2.</strong>
              Comprobante por Telegram.
            </div>
            <div className="stat-chip">
              <strong>3.</strong>
              Activacion por correo.
            </div>
          </div>

          <div className="app-card stack" style={{ padding: 22 }}>
            <span className="eyebrow">Que queda listo</span>
            <div className="performance-item">
              <div>
                <strong>Academia creada</strong>
                <span className="muted">Tenant y usuario administrador preparados.</span>
              </div>
            </div>
            <div className="performance-item">
              <div>
                <strong>Acceso seguro</strong>
                <span className="muted">Enlace temporal de 1 hora para definir contrasena.</span>
              </div>
            </div>
            <div className="performance-item">
              <div>
                <strong>Entrada operativa</strong>
                <span className="muted">Listo para entrar al panel apenas completes la activacion.</span>
              </div>
            </div>
          </div>
        </article>

        <OnboardingRequestForm />
      </section>
    </main>
  );
}
