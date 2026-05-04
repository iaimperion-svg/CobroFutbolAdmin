import { MasterSidebar } from "@/app/backoffice/maestro/MasterSidebar";
import { OnboardingRequestStatus } from "@prisma/client";
import { requireOnboardingReviewAccess } from "@/server/auth/onboarding-review";
import { getBackofficeMasterSnapshot, getOnboardingStatusLabel } from "@/server/services/backoffice-master.service";
import { formatCurrencyFromCents } from "@/server/utils/money";

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

function readPercent(value: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round((value / total) * 100)));
}

export default async function BackofficeMasterPage() {
  await requireOnboardingReviewAccess();
  const snapshot = await getBackofficeMasterSnapshot();
  const healthySchools = snapshot.schools.filter((school) => school.healthTone === "success").length;
  const warningSchools = snapshot.schools.filter((school) => school.healthTone === "warning").length;
  const blockedSchools = snapshot.schools.filter((school) => school.healthTone === "danger").length;
  const clientBase = Math.max(snapshot.overview.totalSchools, 1);
  const cashBaseCents = Math.max(
    snapshot.platformRevenue.currentPlatformBilledCents,
    snapshot.platformRevenue.currentPlatformCollectedCents + snapshot.platformRevenue.currentPlatformOutstandingCents,
    1
  );
  const pipelineMap = new Map(snapshot.onboardingPipeline.map((item) => [item.status, item.count]));

  const kpis = [
    { label: "Clientes", value: String(snapshot.overview.activeSchools), note: `${snapshot.overview.totalSchools} total` },
    { label: "Por revisar", value: String(snapshot.overview.schoolsNeedingAttention), note: `${blockedSchools} urgentes` },
    { label: "Pagado 30 dias", value: formatCurrencyFromCents(snapshot.platformRevenue.platformCollectedLast30DaysCents), note: `${snapshot.platformRevenue.platformCollectedLast30DaysCount} pagos` },
    { label: "Por cobrar", value: formatCurrencyFromCents(snapshot.platformRevenue.currentPlatformOutstandingCents), note: snapshot.currentPeriodLabel }
  ];
  const cashBars = [
    { label: "Creado", value: formatCurrencyFromCents(snapshot.platformRevenue.currentPlatformBilledCents), percent: readPercent(snapshot.platformRevenue.currentPlatformBilledCents, cashBaseCents), tone: "is-neutral" },
    { label: "Pagado", value: formatCurrencyFromCents(snapshot.platformRevenue.currentPlatformCollectedCents), percent: readPercent(snapshot.platformRevenue.currentPlatformCollectedCents, cashBaseCents), tone: "is-success" },
    { label: "Por cobrar", value: formatCurrencyFromCents(snapshot.platformRevenue.currentPlatformOutstandingCents), percent: readPercent(snapshot.platformRevenue.currentPlatformOutstandingCents, cashBaseCents), tone: "is-warning" }
  ];
  const clientBars = [
    { label: "Bien", value: healthySchools, percent: readPercent(healthySchools, clientBase), tone: "is-success" },
    { label: "Por mirar", value: warningSchools, percent: readPercent(warningSchools, clientBase), tone: "is-warning" },
    { label: "Urgentes", value: blockedSchools, percent: readPercent(blockedSchools, clientBase), tone: "is-danger" },
    { label: "Listos", value: snapshot.overview.configuredSchools, percent: readPercent(snapshot.overview.configuredSchools, clientBase), tone: "is-neutral" }
  ];

  return (
    <main className="cf-master cf-master-silver">
      <MasterSidebar active="resumen" subtitle="Backoffice" currentPeriodLabel={snapshot.currentPeriodLabel} />

      <section className="cf-master-main">
        <header className="cf-master-hero">
          <div>
            <span className="cf-master-kicker">Resumen</span>
            <h1>Dashboard</h1>
            <p>Solo graficos y metricas generales. Clientes, ingresos y mantenedores van en paginas separadas.</p>
          </div>
        </header>

        <section className="cf-master-status-grid" aria-label="Metricas principales">
          {kpis.map((item) => (
            <article key={item.label} className="cf-master-status-card">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.note}</small>
            </article>
          ))}
        </section>

        <section className="cf-master-split" id="graficos">
          <article className="cf-master-panel">
            <div className="cf-master-section-head">
              <div>
                <span className="cf-master-kicker">Grafico</span>
                <h2>Pagos CobroFutbol</h2>
              </div>
              <p>{snapshot.currentPeriodLabel}</p>
            </div>
            <div className="cf-master-bars">
              {cashBars.map((item) => (
                <div key={item.label} className="cf-master-bar-row">
                  <div><span>{item.label}</span><strong>{item.value}</strong></div>
                  <div className={`cf-master-bar ${item.tone}`}><span style={{ width: `${item.percent}%` }} /></div>
                </div>
              ))}
            </div>
          </article>

          <article className="cf-master-panel">
            <div className="cf-master-section-head">
              <div>
                <span className="cf-master-kicker">Grafico</span>
                <h2>Estado clientes</h2>
              </div>
              <p>{snapshot.overview.totalSchools} clientes</p>
            </div>
            <div className="cf-master-bars">
              {clientBars.map((item) => (
                <div key={item.label} className="cf-master-bar-row">
                  <div><span>{item.label}</span><strong>{item.value}</strong></div>
                  <div className={`cf-master-bar ${item.tone}`}><span style={{ width: `${item.percent}%` }} /></div>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="cf-master-panel">
          <div className="cf-master-section-head">
            <div>
              <span className="cf-master-kicker">Grafico</span>
              <h2>Ingresos</h2>
            </div>
            <p>Flujo de nuevas escuelas</p>
          </div>
          <div className="cf-master-pipeline">
            {onboardingPipelineOrder.map((status) => {
              const count = pipelineMap.get(status) ?? 0;
              const percent = readPercent(count, Math.max(snapshot.overview.totalSchools, count, 1));
              return (
                <div key={status} className="cf-master-pipeline-step">
                  <strong>{count}</strong>
                  <span>{getOnboardingStatusLabel(status)}</span>
                  <div><i style={{ width: `${Math.max(percent, count > 0 ? 12 : 0)}%` }} /></div>
                </div>
              );
            })}
          </div>
        </section>
      </section>
    </main>
  );
}
