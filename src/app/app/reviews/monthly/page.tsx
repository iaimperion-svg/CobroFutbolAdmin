import { StudentsCrudPanel } from "@/components/students/students-crud-panel";
import { requireSession } from "@/server/auth/session";
import { listStudents } from "@/server/services/students.service";
import { formatCurrencyFromCents } from "@/server/utils/money";

type SearchParamsInput = Promise<Record<string, string | string[] | undefined>>;
type StudentListItem = Awaited<ReturnType<typeof listStudents>>[number];

const monthlyReviewCategoryKeys = [
  "sub-6",
  "sub-8",
  "sub-10",
  "sub-12",
  "sub-14",
  "sub-16",
  "adultos"
] as const;

function readTextParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function buildMonthlyReviewHref(
  params: Record<string, string | string[] | undefined>,
  overrides: Record<string, string | null>
) {
  const next = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value.trim().length > 0) {
      next.set(key, value);
    }
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (!value) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
  }

  const query = next.toString();
  return query.length > 0 ? `/app/reviews/monthly?${query}` : "/app/reviews/monthly";
}

function getCurrentPeriodLabel() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
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

function getStudentCategoryKey(notes: string | null | undefined) {
  const normalized = (notes ?? "").trim();

  if (!normalized) {
    return "sin-categoria";
  }

  return (
    normalized
      .replace(/^categoria\s+/i, "")
      .trim()
      .toLowerCase()
      .replace(/\s*-\s*/g, "-")
      .replace(/\s+/g, " ") || "sin-categoria"
  );
}

function formatCategoryLabel(categoryKey: string) {
  if (categoryKey === "sin-categoria") {
    return "Sin categoría";
  }

  return categoryKey.replace(/\b\w/g, (letter) => letter.toUpperCase()).replace(/-/g, "-");
}

function readPeriodCharges(student: StudentListItem, periodLabel: string) {
  return student.charges.filter(
    (charge) => charge.periodLabel === periodLabel && charge.status !== "CANCELED"
  );
}

function readMonthlyOutstanding(student: StudentListItem, periodLabel: string) {
  return readPeriodCharges(student, periodLabel).reduce(
    (total, charge) => total + charge.outstandingCents,
    0
  );
}

function readMonthlyBilled(student: StudentListItem, periodLabel: string) {
  return readPeriodCharges(student, periodLabel).reduce((total, charge) => total + charge.amountCents, 0);
}

function readMonthlyCollected(student: StudentListItem, periodLabel: string) {
  const billed = readMonthlyBilled(student, periodLabel);
  const outstanding = readMonthlyOutstanding(student, periodLabel);

  return billed - outstanding;
}

function formatReviewPeriod(periodLabel: string) {
  const [yearPart, monthPart] = periodLabel.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);

  return new Intl.DateTimeFormat("es-CL", {
    month: "long",
    year: "numeric"
  }).format(new Date(year, month - 1, 1));
}

function readCollectionRate(billedCents: number, collectedCents: number) {
  return billedCents === 0 ? 0 : Math.round((collectedCents / billedCents) * 100);
}

type CategorySummary = {
  key: string;
  label: string;
  students: number;
  studentsPending: number;
  billedCents: number;
  collectedCents: number;
  outstandingCents: number;
  collectionRate: number;
  disabled: boolean;
};

export default async function MonthlyReviewPage(props: { searchParams?: SearchParamsInput }) {
  const session = await requireSession();
  const students = await listStudents(session.schoolId);
  const params = props.searchParams ? await props.searchParams : {};
  const query = readTextParam(params.q).toLowerCase();
  const debtFilter = readTextParam(params.balance);
  const defaultPeriod = getCurrentPeriodLabel();
  const period = normalizePeriodLabel(readTextParam(params.period), defaultPeriod);
  const reviewPeriodLabel = formatReviewPeriod(period);

  const filteredStudents = students.filter((student) => {
    const monthlyOutstanding = readMonthlyOutstanding(student, period);
    const matchesQuery =
      query.length === 0 ||
      student.fullName.toLowerCase().includes(query) ||
      (student.externalCode ?? "").toLowerCase().includes(query) ||
      student.guardians.some((relation) => relation.guardian.fullName.toLowerCase().includes(query));
    const matchesDebt =
      debtFilter === "" ||
      (debtFilter === "con-saldo" && monthlyOutstanding > 0) ||
      (debtFilter === "al-dia" && monthlyOutstanding === 0);

    return matchesQuery && matchesDebt;
  });

  const categoryMap = new Map<string, CategorySummary>();
  for (const key of monthlyReviewCategoryKeys) {
    categoryMap.set(key, {
      key,
      label: formatCategoryLabel(key),
      students: 0,
      studentsPending: 0,
      billedCents: 0,
      collectedCents: 0,
      outstandingCents: 0,
      collectionRate: 0,
      disabled: true
    });
  }

  for (const student of filteredStudents) {
    const key = getStudentCategoryKey(student.notes);
    const billedCents = readMonthlyBilled(student, period);
    const collectedCents = readMonthlyCollected(student, period);
    const outstandingCents = readMonthlyOutstanding(student, period);
    const existing =
      categoryMap.get(key) ?? {
        key,
        label: formatCategoryLabel(key),
        students: 0,
        studentsPending: 0,
        billedCents: 0,
        collectedCents: 0,
        outstandingCents: 0,
        collectionRate: 0,
        disabled: true
      };

    existing.students += 1;
    existing.billedCents += billedCents;
    existing.collectedCents += collectedCents;
    existing.outstandingCents += outstandingCents;
    existing.studentsPending += outstandingCents > 0 ? 1 : 0;
    existing.collectionRate = readCollectionRate(existing.billedCents, existing.collectedCents);
    existing.disabled = existing.students === 0;
    categoryMap.set(key, existing);
  }

  const extraCategoryKeys = Array.from(categoryMap.keys()).filter(
    (key) => !monthlyReviewCategoryKeys.includes(key as (typeof monthlyReviewCategoryKeys)[number])
  );
  const preferredOrder = [...monthlyReviewCategoryKeys, ...extraCategoryKeys];
  const categorySummaries = preferredOrder
    .map((key) => categoryMap.get(key))
    .filter((category): category is CategorySummary => Boolean(category));

  const requestedCategory = readTextParam(params.category).toLowerCase();
  const knownCategoryKeys = new Set(categorySummaries.map((category) => category.key));
  const activeCategory =
    requestedCategory !== "" && knownCategoryKeys.has(requestedCategory) ? requestedCategory : "all";
  const activeCategoryLabel =
    activeCategory === "all" ? "Todas las categorías" : formatCategoryLabel(activeCategory);

  const visibleStudents = filteredStudents.filter(
    (student) =>
      activeCategory === "all" || getStudentCategoryKey(student.notes) === activeCategory
  );

  const totalMonthlyBilled = visibleStudents.reduce(
    (total, student) => total + readMonthlyBilled(student, period),
    0
  );
  const totalMonthlyCollected = visibleStudents.reduce(
    (total, student) => total + readMonthlyCollected(student, period),
    0
  );
  const totalMonthlyOutstanding = visibleStudents.reduce(
    (total, student) => total + readMonthlyOutstanding(student, period),
    0
  );
  const monthlyCollectionRate = readCollectionRate(totalMonthlyBilled, totalMonthlyCollected);
  const studentsPendingThisMonth = visibleStudents.filter(
    (student) => readMonthlyOutstanding(student, period) > 0
  ).length;
  const topCategory =
    [...categorySummaries]
      .filter((category) => category.outstandingCents > 0)
      .sort((left, right) => right.outstandingCents - left.outstandingCents)[0] ?? null;

  const executiveTitle =
    activeCategory === "all" ? "Cobro mensual del período" : `${activeCategoryLabel} / detalle del mes`;
  const executiveCopy =
    activeCategory === "all"
      ? topCategory
        ? `${topCategory.label} concentra el mayor saldo pendiente del período.`
        : `No hay deuda pendiente en ${reviewPeriodLabel}.`
      : studentsPendingThisMonth > 0
        ? `${studentsPendingThisMonth} alumno${studentsPendingThisMonth === 1 ? "" : "s"} de ${activeCategoryLabel} siguen con saldo en ${reviewPeriodLabel}.`
        : `${activeCategoryLabel} no tiene saldo pendiente en ${reviewPeriodLabel}.`;

  const monthlyKpis = [
    {
      label: "Total del mes",
      value: formatCurrencyFromCents(totalMonthlyBilled),
      note: "Monto facturado del período."
    },
    {
      label: "Cobrado",
      value: formatCurrencyFromCents(totalMonthlyCollected),
      note: "Pagos ya cerrados este mes."
    },
    {
      label: "Pendiente",
      value: formatCurrencyFromCents(totalMonthlyOutstanding),
      note: "Saldo que aún requiere seguimiento."
    },
    {
      label: "% de recaudación",
      value: `${monthlyCollectionRate}%`,
      note: "Avance real de cobranza del período."
    },
    {
      label: "Alumnos con saldo",
      value: `${studentsPendingThisMonth}`,
      note: "Alumnos que aún arrastran deuda del mes."
    }
  ];

  return (
    <section className="stack monthly-review-screen">
      <div className="quick-filters review-mode-switch" aria-label="Vistas de cobranza">
        <a className="quick-filter" href="/app/reviews">
          Revisión de pago
        </a>
        <a className="quick-filter active" href="/app/reviews/monthly">
          Cobro mensual
        </a>
      </div>

      <section className="monthly-review-header">
        <div className="monthly-review-hero">
          <div className="monthly-review-copy">
            <span className="eyebrow">Cobro mensual</span>
            <h1 className="monthly-review-title">{executiveTitle}</h1>
            <p className="monthly-review-description">
              {reviewPeriodLabel} / {executiveCopy}
            </p>
          </div>
          <form className="monthly-review-period-form" method="get">
            <input type="hidden" name="q" value={readTextParam(params.q)} />
            <input type="hidden" name="balance" value={debtFilter} />
            {activeCategory !== "all" ? (
              <input type="hidden" name="category" value={activeCategory} />
            ) : null}
            <label className="dashboard-month-field monthly-review-month-field" htmlFor="monthly-period-top">
              <span>Mes a revisar</span>
              <input id="monthly-period-top" name="period" type="month" defaultValue={period} />
            </label>
            <button className="button button-small" type="submit">
              Ver mes
            </button>
          </form>
        </div>

        <div className="monthly-review-kpis monthly-review-kpis-expanded">
          {monthlyKpis.map((item) => (
            <article key={item.label} className="monthly-review-kpi">
              <span className="monthly-review-kpi-label">{item.label}</span>
              <strong className="monthly-review-kpi-value">{item.value}</strong>
              <p className="monthly-review-kpi-note">{item.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="monthly-review-category-section">
        <div className="monthly-review-section-head">
          <div>
            <span className="eyebrow">Resumen por categoría</span>
            <h2 className="card-title">Desempeño del mes por grupo</h2>
          </div>
        </div>
        <div className="monthly-review-category-grid">
          <a
            className={`monthly-review-category-card${activeCategory === "all" ? " active" : ""}`}
            href={buildMonthlyReviewHref(params, { category: null })}
          >
            <strong>Todas</strong>
            <span>{formatCurrencyFromCents(totalMonthlyOutstanding)} pendiente</span>
            <small>{studentsPendingThisMonth} alumnos con saldo</small>
          </a>
          {categorySummaries.map((category) => (
            <a
              key={category.key}
              className={`monthly-review-category-card${activeCategory === category.key ? " active" : ""}${category.outstandingCents === 0 ? " is-secondary" : ""}${category.disabled ? " disabled" : ""}`}
              href={buildMonthlyReviewHref(params, { category: category.key })}
              aria-disabled={category.disabled ? "true" : undefined}
            >
              <strong>{category.label}</strong>
              <span>{formatCurrencyFromCents(category.outstandingCents)} pendiente</span>
              <small>
                {category.studentsPending} con saldo / {category.collectionRate}% cobrado
              </small>
            </a>
          ))}
        </div>
      </section>

      <form className="toolbar monthly-review-toolbar" method="get">
        <input type="hidden" name="period" value={period} />
        {activeCategory !== "all" ? (
          <input type="hidden" name="category" value={activeCategory} />
        ) : null}
        <div className="toolbar-group monthly-review-toolbar-group">
          <div className="toolbar-field">
            <label htmlFor="monthly-review-query">Buscar</label>
            <input
              id="monthly-review-query"
              name="q"
              defaultValue={readTextParam(params.q)}
              className="toolbar-input"
              placeholder="Buscar por alumno, código o apoderado"
            />
          </div>
          <div className="toolbar-field">
            <label htmlFor="monthly-review-balance">Estado</label>
            <select
              id="monthly-review-balance"
              name="balance"
              defaultValue={debtFilter}
              className="toolbar-select"
            >
              <option value="">Todos</option>
              <option value="con-saldo">Con saldo pendiente</option>
              <option value="al-dia">Al día</option>
            </select>
          </div>
        </div>
        <div className="toolbar-actions">
          <button className="button button-small" type="submit">
            Aplicar filtros
          </button>
          <a
            className="button-secondary button-small"
            href={buildMonthlyReviewHref(
              { period },
              activeCategory !== "all" ? { category: activeCategory } : {}
            )}
          >
            Limpiar
          </a>
        </div>
      </form>

      <StudentsCrudPanel
        initialStudents={visibleStudents}
        isFiltered={query !== "" || debtFilter !== "" || activeCategory !== "all"}
        reviewPeriod={period}
        reviewPeriodLabel={reviewPeriodLabel}
        activeCategoryLabel={activeCategoryLabel}
        mode="monthly"
      />
    </section>
  );
}
