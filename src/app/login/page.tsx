import { redirect } from "next/navigation";
import { BrandMark } from "@/components/brand/brand-mark";
import { LoginForm } from "@/components/auth/login-form";
import { getSession } from "@/server/auth/session";

export default async function LoginPage() {
  const session = await getSession();

  if (session) {
    redirect("/app");
  }

  return (
    <main className="login-wrap">
      <section className="login-grid">
        <article className="login-card stack">
          <BrandMark
            src="/brand/logo_.png"
            trimTransparentPadding={false}
            subtitle="SaaS deportivo premium"
          />
          <span className="eyebrow">Ingreso a CobroFutbol</span>
          <h1 className="app-title">Automatiza cobros con disciplina de club profesional.</h1>
          <p className="muted">
            Pensado para academias que necesitan energía de alto rendimiento, control financiero y
            una experiencia clara para equipos administrativos.
          </p>
          <div className="badge-row">
            <div className="stat-chip">
              <strong>Extracción</strong>
              Lectura y trazabilidad de comprobantes.
            </div>
            <div className="stat-chip">
              <strong>Control</strong>
              Panel, alumnos, conciliaciones y revisión.
            </div>
          </div>
        </article>

        <article className="login-card stack">
          <div className="stack" style={{ gap: 8 }}>
            <span className="eyebrow">Acceso al panel</span>
            <h2 className="app-title" style={{ fontSize: "2rem" }}>
              Entra a la cabina operativa
            </h2>
            <p className="muted">
              Ingresa con tu correo y la contrasena asignada por el administrador.
            </p>
          </div>
          <LoginForm />
        </article>
      </section>
    </main>
  );
}
