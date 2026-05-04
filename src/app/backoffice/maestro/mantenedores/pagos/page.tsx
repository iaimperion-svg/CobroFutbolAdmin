import { MasterSidebar } from "@/app/backoffice/maestro/MasterSidebar";
import { requireOnboardingReviewAccess } from "@/server/auth/onboarding-review";
import { getBackofficeMasterSnapshot, getOnboardingPlanLabel } from "@/server/services/backoffice-master.service";
import { formatCurrencyFromCents } from "@/server/utils/money";

export const dynamic = "force-dynamic";

export default async function BackofficePaymentsMaintainerPage() {
  await requireOnboardingReviewAccess();
  const snapshot = await getBackofficeMasterSnapshot();
  const revenue = snapshot.platformRevenue;

  return (
    <main className="cf-master cf-master-silver cf-module-page">
      <MasterSidebar active="pagos" subtitle="Pagos CF" currentPeriodLabel={snapshot.currentPeriodLabel} />
      <section className="cf-master-main cf-module-shell">
        <header className="cf-module-hero">
          <span className="cf-master-kicker">Pagos CF</span>
          <h1>Pagos CobroFutbol</h1>
          <p>Solo cobros y pagos de escuelas hacia CobroFutbol.</p>
        </header>

        <section className="cf-module-metrics">
          <article><span>Pagado 30 dias</span><strong>{formatCurrencyFromCents(revenue.platformCollectedLast30DaysCents)}</strong></article>
          <article><span>Por cobrar</span><strong>{formatCurrencyFromCents(revenue.currentPlatformOutstandingCents)}</strong></article>
          <article><span>Esperado mensual</span><strong>{formatCurrencyFromCents(revenue.platformMonthlyExpectedCents)}</strong></article>
        </section>

        <section className="cf-module-table">
          <table>
            <thead><tr><th>Plan</th><th>Clientes</th><th>Monto</th></tr></thead>
            <tbody>{revenue.planMix.map((plan) => (<tr key={plan.plan}><td><strong>{getOnboardingPlanLabel(plan.plan)}</strong></td><td>{plan.activeSchools}</td><td>{formatCurrencyFromCents(plan.monthlyAmountCents)}</td></tr>))}</tbody>
          </table>
        </section>
      </section>
    </main>
  );
}
