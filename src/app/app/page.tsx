import { KpiCard } from "@/components/dashboard/kpi-card";
import { SectionHeader } from "@/components/ui/section-header";
import { requireSession } from "@/server/auth/session";
import { getFinancialDashboard } from "@/server/services/dashboard.service";
import { formatCurrencyFromCents } from "@/server/utils/money";

export default async function DashboardPage() {
  const session = await requireSession();
  const dashboard = await getFinancialDashboard(session.schoolId);
  const autoRate = Math.round(dashboard.autoReconciliationRate * 100);

  const chartData = [
    { label: "Facturado", value: dashboard.billedCents },
    { label: "Cobrado", value: dashboard.collectedCents },
    { label: "Pendiente", value: dashboard.outstandingCents }
  ];
  const chartMax = Math.max(...chartData.map((item) => item.value), 1);

  return (
    <>
      <section className="app-header">
        <div className="section-heading">
          <SectionHeader
            eyebrow="Panel financiero"
            title="Control total de la academia"
            description="Un panel de rendimiento para seguir recaudacion, deuda abierta y automatizacion con lectura rapida, visual deportiva y foco operativo real."
          />
        </div>

        <div className="hero-stat-row">
          <div className="stat-chip featured">
            <span className="stat-chip-label">Automatizacion</span>
            <strong>{autoRate}%</strong>
            Conciliacion automatica lograda.
          </div>
          <div className="stat-chip">
            <span className="stat-chip-label">Revision</span>
            <strong>{dashboard.openReviews}</strong>
            Casos pendientes de validacion.
          </div>
          <div className="stat-chip">
            <span className="stat-chip-label">Volumen</span>
            <strong>{dashboard.totalReceipts}</strong>
            Comprobantes trabajados por el sistema.
          </div>
        </div>
      </section>

      <section className="stats-grid stats-grid-elevated">
        <KpiCard
          label="Facturado"
          value={formatCurrencyFromCents(dashboard.billedCents)}
          variant="primary"
          context="Volumen total del ciclo activo"
        />
        <KpiCard
          label="Cobrado"
          value={formatCurrencyFromCents(dashboard.collectedCents)}
          tone="success"
          context="Pagos confirmados y cerrados"
        />
        <KpiCard
          label="Pendiente"
          value={formatCurrencyFromCents(dashboard.outstandingCents)}
          tone="warning"
          context="Saldo que sigue en radar"
        />
        <KpiCard
          label="Revisiones abiertas"
          value={String(dashboard.openReviews)}
          context="Casos que requieren decision del equipo"
        />
      </section>

      <section className="dashboard-hero">
        <article className="app-card tactical-card stack">
          <div className="eyebrow">Rendimiento de conciliacion</div>
          <h3 className="card-title">{autoRate}% de comprobantes conciliados sin intervencion manual</h3>
          <p className="section-description compact">
            Este indicador resume precision de extraccion, calidad de coincidencia y capacidad del
            sistema para cerrar pagos con autonomia.
          </p>
          <div className="performance-list">
            <div className="performance-item">
              <div>
                <strong>Facturacion activa</strong>
                <span className="muted">Volumen total del periodo</span>
              </div>
              <strong>{formatCurrencyFromCents(dashboard.billedCents)}</strong>
            </div>
            <div className="performance-item">
              <div>
                <strong>Recaudacion confirmada</strong>
                <span className="muted">Pagos conciliados y cerrados</span>
              </div>
              <strong>{formatCurrencyFromCents(dashboard.collectedCents)}</strong>
            </div>
            <div className="performance-item">
              <div>
                <strong>Saldo en seguimiento</strong>
                <span className="muted">Deuda que sigue en radar</span>
              </div>
              <strong>{formatCurrencyFromCents(dashboard.outstandingCents)}</strong>
            </div>
          </div>
        </article>

        <article className="app-card stack">
          <div className="eyebrow">Panel de caja</div>
          <h3 className="card-title">Lectura tactica de ingresos y pendiente</h3>
          <div className="mini-chart">
            {chartData.map((item) => (
              <div key={item.label} className="bar-row">
                <div className="section-heading chart-row-head" style={{ alignItems: "baseline" }}>
                  <strong>{item.label}</strong>
                  <span className="muted">{formatCurrencyFromCents(item.value)}</span>
                </div>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{ width: `${Math.max((item.value / chartMax) * 100, 8)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="cards-grid roomy-cards">
        <article className="app-card stack">
          <div className="eyebrow">Lectura ejecutiva</div>
          <h3 className="card-title">KPIs visibles, firmes y listos para decidir</h3>
          <p className="section-description compact">
            El panel usa acentos verdes para los hitos positivos y gris oscuro para sostener una
            interfaz sobria, confiable y con identidad de academia profesional.
          </p>
        </article>

        <article className="app-card stack">
          <div className="eyebrow">Disciplina operativa</div>
          <h3 className="card-title">Tecnologia aplicada al dia a dia de la cobranza</h3>
          <p className="section-description compact">
            CobroFutbol mantiene foco administrativo sin perder energia visual ni la sensacion de
            panel deportivo premium.
          </p>
        </article>
      </section>
    </>
  );
}
