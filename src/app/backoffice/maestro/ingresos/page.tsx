import { MasterSidebar } from "@/app/backoffice/maestro/MasterSidebar";
import { OnboardingRequestStatus } from "@prisma/client";
import { requireOnboardingReviewAccess } from "@/server/auth/onboarding-review";
import { getBackofficeMasterSnapshot, getOnboardingPlanLabel, getOnboardingStatusLabel } from "@/server/services/backoffice-master.service";

export const dynamic = "force-dynamic";

const onboardingPipelineOrder = [
  OnboardingRequestStatus.PENDING_PAYMENT,
  OnboardingRequestStatus.TELEGRAM_LINKED,
  OnboardingRequestStatus.RECEIPT_RECEIVED,
  OnboardingRequestStatus.UNDER_REVIEW,
  OnboardingRequestStatus.APPROVED_PENDING_ACTIVATION,
  OnboardingRequestStatus.ACTIVE,
  OnboardingRequestStatus.REJECTED,
  OnboardingRequestStatus.EXPIRED,
  OnboardingRequestStatus.CANCELED
] as const;

function formatDateTime(value: Date | null | undefined) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(value);
}

export default async function BackofficeIngressPage() {
  await requireOnboardingReviewAccess();
  const snapshot = await getBackofficeMasterSnapshot();
  const pipelineMap = new Map(snapshot.onboardingPipeline.map((item) => [item.status, item.count]));
  const rows = snapshot.schools.filter((school) => school.latestOnboarding);

  return (
    <main className="cf-master cf-master-silver">
      <MasterSidebar active="ingresos" subtitle="Ingresos" currentPeriodLabel={snapshot.currentPeriodLabel} />

      <section className="cf-master-main">
        <header className="cf-master-hero">
          <div><span className="cf-master-kicker">Ingresos</span><h1>Ingresos</h1><p>Solo nuevas escuelas y estado de onboarding.</p></div>
        </header>

        <section className="cf-master-panel">
          <div className="cf-master-section-head"><div><span className="cf-master-kicker">Grafico</span><h2>Flujo</h2></div><p>{rows.length} solicitudes ligadas</p></div>
          <div className="cf-master-pipeline">
            {onboardingPipelineOrder.map((status) => (
              <div key={status} className="cf-master-pipeline-step">
                <strong>{pipelineMap.get(status) ?? 0}</strong>
                <span>{getOnboardingStatusLabel(status)}</span>
                <div><i style={{ width: `${pipelineMap.get(status) ? 100 : 0}%` }} /></div>
              </div>
            ))}
          </div>
        </section>

        <section className="cf-master-panel cf-saas-table-panel">
          <div className="cf-master-section-head"><div><span className="cf-master-kicker">Tabla</span><h2>Ingresos</h2></div><p>Escuelas con solicitud</p></div>
          <div className="cf-saas-table-wrap">
            <table className="cf-saas-table">
              <thead><tr><th>Escuela</th><th>Codigo</th><th>Plan</th><th>Estado</th><th>Fecha</th><th /></tr></thead>
              <tbody>
                {rows.map((school) => school.latestOnboarding ? (
                  <tr key={school.id}>
                    <td><strong>{school.name}</strong><small>{school.operationsEmail ?? "Sin correo"}</small></td>
                    <td>{school.latestOnboarding.publicCode}</td>
                    <td>{getOnboardingPlanLabel(school.latestOnboarding.plan)}</td>
                    <td><span className="cf-master-pill is-neutral">{getOnboardingStatusLabel(school.latestOnboarding.status)}</span></td>
                    <td>{formatDateTime(school.latestOnboarding.createdAt)}</td>
                    <td><div className="cf-saas-actions"><a href={`/backoffice/onboarding?q=${encodeURIComponent(school.latestOnboarding.publicCode)}`}>Abrir</a></div></td>
                  </tr>
                ) : null)}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}
