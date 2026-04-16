import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/brand/brand-mark";
import { getSession } from "@/server/auth/session";

export default async function HomePage() {
  const session = await getSession();

  if (session) {
    redirect("/app");
  }

  return (
    <main className="login-wrap">
      <section className="login-card stack" style={{ width: "min(560px, 100%)" }}>
        <BrandMark subtitle="Acceso directo al panel operativo" />
        <span className="eyebrow">CobroFutbol</span>
        <h1 className="app-title">Ingresa al panel de gestion.</h1>
        <p className="muted">
          Esta portada queda solo como punto de entrada. Todo el flujo principal vive dentro del
          panel.
        </p>
        <div className="action-row">
          <Link href="/login" className="button">
            Entrar al panel
          </Link>
        </div>
      </section>
    </main>
  );
}
