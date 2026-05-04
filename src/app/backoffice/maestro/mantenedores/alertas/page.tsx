import { MasterSidebar } from "@/app/backoffice/maestro/MasterSidebar";
import { requireOnboardingReviewAccess } from "@/server/auth/onboarding-review";
import { getBackofficeMasterSnapshot } from "@/server/services/backoffice-master.service";

export const dynamic = "force-dynamic";

export default async function BackofficeAlertsMaintainerPage() {
  await requireOnboardingReviewAccess();
  const snapshot = await getBackofficeMasterSnapshot();
  const schools = snapshot.schools.filter((school) => school.attentionScore > 0);

  return (
    <main className="cf-master cf-master-silver cf-module-page">
      <MasterSidebar active="alertas" subtitle="Alertas" currentPeriodLabel={snapshot.currentPeriodLabel} />
      <section className="cf-master-main cf-module-shell">
        <header className="cf-module-hero">
          <span className="cf-master-kicker">Alertas</span>
          <h1>Clientes por revisar</h1>
          <p>Solo clientes con alerta o accion pendiente.</p>
        </header>

        <section className="cf-module-table">
          <table>
            <thead><tr><th>Cliente</th><th>Estado</th><th>Puntos</th><th>Accion</th></tr></thead>
            <tbody>{schools.length > 0 ? schools.map((school) => (<tr key={school.id}><td><strong>{school.name}</strong></td><td>{school.healthLabel}</td><td>{school.attentionScore}</td><td><a href={`/backoffice/maestro/${encodeURIComponent(school.slug)}`}>Abrir</a></td></tr>)) : (<tr><td colSpan={4}>Sin alertas por ahora.</td></tr>)}</tbody>
          </table>
        </section>
      </section>
    </main>
  );
}
