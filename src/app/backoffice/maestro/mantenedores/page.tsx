import { MasterSidebar } from "@/app/backoffice/maestro/MasterSidebar";
import { requireOnboardingReviewAccess } from "@/server/auth/onboarding-review";

export const dynamic = "force-dynamic";

const modules = [
  { href: "/backoffice/maestro/mantenedores/pagos", icon: "$", title: "Pagos CF", detail: "Cobros, pagos y deuda hacia CobroFutbol." },
  { href: "/backoffice/maestro/mantenedores/alertas", icon: "AL", title: "Alertas", detail: "Clientes que necesitan revision o accion." }
];

export default async function BackofficeMaintainersPage() {
  await requireOnboardingReviewAccess();

  return (
    <main className="cf-master cf-master-silver cf-module-page">
      <MasterSidebar subtitle="Modulos" />
      <section className="cf-master-main cf-module-shell">
        <header className="cf-module-hero">
          <span className="cf-master-kicker">Mantenedores</span>
          <h1>Modulos operativos</h1>
          <p>Los accesos principales ya estan en el menu lateral. Esta pantalla queda como indice rapido.</p>
        </header>

        <section className="cf-module-grid">
          {modules.map((module) => (
            <a key={module.href} href={module.href} className="cf-module-card">
              <span>{module.icon}</span>
              <strong>{module.title}</strong>
              <small>{module.detail}</small>
            </a>
          ))}
        </section>
      </section>
    </main>
  );
}
