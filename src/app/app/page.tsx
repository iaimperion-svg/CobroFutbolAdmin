import { requireSession } from "@/server/auth/session";
import { getMonthlyDashboard } from "@/server/services/monthly-dashboard.service";
import { formatCurrencyFromCents } from "@/server/utils/money";

type SearchParamsInput = Promise<Record<string, string | string[] | undefined>>;

function DashboardIcon(props: {
  icon:
    | "total"
    | "collected"
    | "pending"
    | "rate"
    | "reviews"
    | "debtors"
    | "unreconciled"
    | "due"
    | "detail";
}) {
  switch (props.icon) {
    case "total":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 8.5h16v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
          <path d="M4 8.5V7a2 2 0 0 1 2-2h10" />
          <path d="M15 13h5" />
        </svg>
      );
    case "collected":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 12h16" />
          <path d="m13 7 5 5-5 5" />
          <path d="M6 7.5h3" />
        </svg>
      );
    case "pending":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 6v6l4 2.2" />
          <path d="M21 12a9 9 0 1 1-2.64-6.36A9 9 0 0 1 21 12Z" />
        </svg>
      );
    case "rate":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 18a8.5 8.5 0 1 1 14 0" />
          <path d="m12 12 4-4" />
          <path d="M12 12h.01" />
        </svg>
      );
    case "reviews":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 4.5h8l4 4v11H6z" />
          <path d="M14 4.5v4h4" />
          <path d="M9 13h6M9 16h4" />
        </svg>
      );
    case "debtors":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 12a3.5 3.5 0 1 0-3.5-3.5A3.5 3.5 0 0 0 12 12Z" />
          <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
        </svg>
      );
    case "unreconciled":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 4.5h10v15l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5z" />
          <path d="M9 9h6M9 12.5h6M9 16h4" />
        </svg>
      );
    case "due":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 3.5v4M18 3.5v4M4.5 8.5h15" />
          <path d="M5 6.5h14v12H5z" />
          <path d="M12 12v4M12 12h3.5" />
        </svg>
      );
    case "detail":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12h14" />
          <path d="m13 7 5 5-5 5" />
        </svg>
      );
  }
}

function getCurrentPeriodLabel() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function readTextParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePeriodLabel(value: string, fallback: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return fallback;
  }

  const [, month] = value.split("-");
  const monthNumber = Number(month);

  if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    return fallback;
  }

  return value;
}

function buildMonthlyReviewHref(period: string, category?: string) {
  const params = new URLSearchParams({ period });

  if (category) {
    params.set("category", category);
  }

  return `/app/reviews/monthly?${params.toString()}`;
}

function buildActionHref(period: string, actionKey: string) {
  switch (actionKey) {
    case "reviews":
      return "/app/reviews";
    case "debtors":
      return `/app/reviews/monthly?${new URLSearchParams({ period, balance: "con-saldo" }).toString()}`;
    case "unreconciled":
      return "/app/receipts";
    case "due-week":
      return `/app/reviews/monthly?${new URLSearchParams({ period, balance: "con-saldo" }).toString()}`;
    default:
      return "/app";
  }
}

function formatCompactPercent(value: number) {
  return `${value}%`;
}

export default async function DashboardPage(props: { searchParams?: SearchParamsInput }) {
  const session = await requireSession();
  const params = props.searchParams ? await props.searchParams : {};
  const defaultPeriod = getCurrentPeriodLabel();
  const period = normalizePeriodLabel(readTextParam(params.period), defaultPeriod);
  const dashboard = await getMonthlyDashboard(session.schoolId, period);
  const ranking = dashboard.ranking.slice(0, 5);
  const mobileCategoryHighlights = dashboard.categoryCards
    .filter((category) => category.outstandingCents > 0)
    .slice(0, 5);

  const kpiCards = [
    {
      key: "total",
      label: "Total del mes",
      value: formatCurrencyFromCents(dashboard.kpis.totalMonthCents),
      note: `${dashboard.totals.totalStudentsWithCharge} alumnos con mensualidad del período.`,
      icon: "total" as const,
      tone: "neutral"
    },
    {
      key: "collected",
      label: "Cobrado",
      value: formatCurrencyFromCents(dashboard.kpis.collectedCents),
      note: `${dashboard.totals.totalStudentsPaid} alumnos ya están al día.`,
      icon: "collected" as const,
      tone: "success"
    },
    {
      key: "pending",
      label: "Pendiente",
      value: formatCurrencyFromCents(dashboard.kpis.pendingCents),
      note: `${dashboard.totals.studentsWithDebt} alumnos aún tienen saldo pendiente.`,
      icon: "pending" as const,
      tone: "warning"
    },
    {
      key: "rate",
      label: "% de recaudación",
      value: formatCompactPercent(dashboard.kpis.collectionRate),
      note: "Avance real de cobranza sobre el total del mes.",
      icon: "rate" as const,
      tone: "accent"
    }
  ];

  const actionIcons = {
    reviews: "reviews",
    debtors: "debtors",
    unreconciled: "unreconciled",
    "due-week": "due"
  } as const;

  return (
    <div className="dashboard-screen">
      <section className="dashboard-toolbar dashboard-toolbar-executive">
        <div className="dashboard-toolbar-copy">
          <span className="eyebrow">Panel</span>
          <strong className="dashboard-toolbar-title">{dashboard.periodTitle}</strong>
          <p className="dashboard-toolbar-note">{dashboard.topIssue}</p>
        </div>
        <form className="dashboard-month-form" method="get">
          <label className="dashboard-month-field" htmlFor="dashboard-period">
            <span>Seleccionar mes</span>
            <input id="dashboard-period" name="period" type="month" defaultValue={period} />
          </label>
          <button className="button button-small" type="submit">
            Ver mes
          </button>
        </form>
      </section>

      <section className="dashboard-category-grid">
        {dashboard.categoryCards.map((category, index) => {
          const hasDebt = category.outstandingCents > 0;
          const categoryTone = hasDebt ? ` tone-${index % 3}` : "";
          const categoryCopy = hasDebt
            ? `${category.studentsPending} con saldo`
            : category.studentsWithMonthlyCharge > 0
              ? "Al día"
              : "Sin movimiento";

          return (
            <a
              key={category.key}
              className={`dashboard-category-card${categoryTone}${hasDebt ? "" : " is-secondary"}`}
              href={buildMonthlyReviewHref(period, category.key)}
            >
              <span className="dashboard-category-mark" aria-hidden="true">
                {category.mark}
              </span>
              <div className="dashboard-category-card-head">
                <div>
                  <div className="dashboard-category-label">{category.label}</div>
                  <p className="dashboard-category-copy">{categoryCopy}</p>
                </div>
              </div>
              <strong className="dashboard-category-value">
                {formatCurrencyFromCents(category.outstandingCents)}
              </strong>
              <div className="dashboard-category-meta">
                {hasDebt ? <span>{category.studentsPending} por cobrar</span> : null}
                <span>{category.collectionRate}% cobrado</span>
              </div>
            </a>
          );
        })}
      </section>

      <section className="dashboard-kpi-strip">
        {kpiCards.map((item) => (
          <article key={item.key} className={`dashboard-kpi-card tone-${item.tone}`}>
            <div className="dashboard-kpi-card-top">
              <span className="dashboard-kpi-icon" aria-hidden="true">
                <DashboardIcon icon={item.icon} />
              </span>
              <span className="dashboard-kpi-label">{item.label}</span>
            </div>
            <strong className="dashboard-kpi-value">{item.value}</strong>
            <p className="dashboard-kpi-note">{item.note}</p>
          </article>
        ))}
      </section>

      <section className="dashboard-executive-grid">
        <article className="dashboard-panel">
          <div className="dashboard-panel-header">
            <div>
              <span className="eyebrow">Acciones pendientes</span>
              <h3 className="card-title">Qué revisar este mes</h3>
              <p className="dashboard-panel-copy">
                Entra aquí solo cuando haya algo pendiente por resolver en el período.
              </p>
            </div>
          </div>

          <div className="dashboard-action-grid">
            {dashboard.actions.map((action) => (
              <a
                key={action.key}
                className="dashboard-action-card"
                href={buildActionHref(period, action.key)}
              >
                <span className="dashboard-action-icon" aria-hidden="true">
                  <DashboardIcon icon={actionIcons[action.key as keyof typeof actionIcons]} />
                </span>
                <div className="dashboard-action-copy">
                  <span className="dashboard-action-label">{action.label}</span>
                  <strong className="dashboard-action-value">{action.value}</strong>
                  <p className="dashboard-action-note">{action.description}</p>
                </div>
              </a>
            ))}
          </div>
        </article>

        <article className="dashboard-panel">
          <div className="dashboard-panel-header">
            <div>
              <span className="eyebrow">Categorías con deuda</span>
              <h3 className="card-title">Dónde está el mayor problema</h3>
              <p className="dashboard-panel-copy">
                Se muestran solo las categorías con mayor saldo pendiente del mes.
              </p>
            </div>
          </div>

          {ranking.length > 0 ? (
            <div className="dashboard-ranking-list">
              {ranking.map((category, index) => (
                <a
                  key={category.key}
                  className="dashboard-ranking-item"
                  href={buildMonthlyReviewHref(period, category.key)}
                >
                  <div className="dashboard-ranking-main">
                    <span className="dashboard-ranking-position">#{index + 1}</span>
                    <div className="dashboard-ranking-copy">
                      <strong>{category.label}</strong>
                      <span>{category.studentsPending} con saldo | {category.collectionRate}% cobrado</span>
                    </div>
                  </div>
                  <div className="dashboard-ranking-side">
                    <strong>{formatCurrencyFromCents(category.outstandingCents)}</strong>
                    <span className="dashboard-detail-link">
                      <span>Ver detalle</span>
                      <span aria-hidden="true">
                        <DashboardIcon icon="detail" />
                      </span>
                    </span>
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <div className="dashboard-empty-state">
              <strong>No hay categorías con deuda en este mes.</strong>
              <p>Todas las categorías aparecen al día en el período seleccionado.</p>
            </div>
          )}
        </article>
      </section>

      {ranking.length === 0 ? (
        <section className="dashboard-mobile-categories" aria-label="Categorías del mes">
          <div className="dashboard-panel-header">
            <div>
              <span className="eyebrow">Categorías del mes</span>
              <h3 className="card-title">Resumen rápido por categoría</h3>
              <p className="dashboard-panel-copy">
                Vista liviana del estado por categoría antes de entrar al detalle.
              </p>
            </div>
          </div>

          <div className="dashboard-mobile-category-strip">
            {(mobileCategoryHighlights.length > 0
              ? mobileCategoryHighlights
              : dashboard.categoryCards.slice(0, 5)
            ).map((category) => (
              <a
                key={category.key}
                className={`dashboard-mobile-category-card${
                  category.outstandingCents > 0 ? "" : " is-secondary"
                }`}
                href={buildMonthlyReviewHref(period, category.key)}
              >
                <strong>{category.label}</strong>
                <span>{formatCurrencyFromCents(category.outstandingCents)}</span>
                <small>
                  {category.outstandingCents > 0
                    ? `${category.studentsPending} con saldo`
                    : category.studentsWithMonthlyCharge > 0
                      ? "Al día"
                      : "Sin movimiento"}
                </small>
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
