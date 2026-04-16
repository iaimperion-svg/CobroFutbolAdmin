import Link from "next/link";
import { StudentsCrudPanel } from "@/components/students/students-crud-panel";
import { SectionHeader } from "@/components/ui/section-header";
import { requireSession } from "@/server/auth/session";
import { listStudents } from "@/server/services/students.service";
import { formatCurrencyFromCents } from "@/server/utils/money";

type SearchParamsInput = Promise<Record<string, string | string[] | undefined>>;
type StudentListItem = Awaited<ReturnType<typeof listStudents>>[number];

function readTextParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function buildStudentsHref(
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
  return query.length > 0 ? `/app/students?${query}` : "/app/students";
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
    return "Sin categoria";
  }

  return categoryKey.replace(/\b\w/g, (letter) => letter.toUpperCase()).replace(/-/g, "-");
}

function readMonthlyOutstanding(student: StudentListItem, periodLabel: string) {
  return student.charges
    .filter((charge) => charge.periodLabel === periodLabel && charge.status !== "CANCELED")
    .reduce((total, charge) => total + charge.outstandingCents, 0);
}

function readMonthlyConsolidated(student: StudentListItem, periodLabel: string) {
  const periodCharges = student.charges.filter(
    (charge) => charge.periodLabel === periodLabel && charge.status !== "CANCELED"
  );

  return periodCharges.length > 0 && periodCharges.every((charge) => charge.outstandingCents === 0);
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

export default async function StudentsPage(props: { searchParams?: SearchParamsInput }) {
  const session = await requireSession();
  const students = await listStudents(session.schoolId);
  const params = props.searchParams ? await props.searchParams : {};
  const query = readTextParam(params.q).toLowerCase();
  const debtFilter = readTextParam(params.balance);
  const defaultPeriod = getCurrentPeriodLabel();
  const period = normalizePeriodLabel(readTextParam(params.period), defaultPeriod);
  const reviewPeriodLabel = formatReviewPeriod(period);

  const filteredStudents = students.filter((student) => {
    const outstanding = student.charges.reduce((total, charge) => total + charge.outstandingCents, 0);
    const matchesQuery =
      query.length === 0 ||
      student.fullName.toLowerCase().includes(query) ||
      (student.externalCode ?? "").toLowerCase().includes(query) ||
      student.guardians.some((relation) => relation.guardian.fullName.toLowerCase().includes(query));
    const matchesDebt =
      debtFilter === "" ||
      (debtFilter === "con-saldo" && outstanding > 0) ||
      (debtFilter === "al-dia" && outstanding === 0);

    return matchesQuery && matchesDebt;
  });

  const categoryRollup = filteredStudents.reduce<
    Map<string, { key: string; label: string; students: number; monthlyOutstandingCents: number }>
  >((categories, student) => {
    const key = getStudentCategoryKey(student.notes);
    const monthlyOutstandingCents = readMonthlyOutstanding(student, period);
    const existing =
      categories.get(key) ?? {
        key,
        label: formatCategoryLabel(key),
        students: 0,
        monthlyOutstandingCents: 0
      };

    existing.students += 1;
    existing.monthlyOutstandingCents += monthlyOutstandingCents;
    categories.set(key, existing);

    return categories;
  }, new Map());

  const categoryTabs = Array.from(categoryRollup.values()).sort((left, right) =>
    left.label.localeCompare(right.label, "es-CL")
  );
  const requestedCategory = readTextParam(params.category).toLowerCase();
  const activeCategory =
    requestedCategory !== "" && categoryRollup.has(requestedCategory) ? requestedCategory : "all";
  const activeCategoryLabel =
    activeCategory === "all" ? "Todas las categorias" : formatCategoryLabel(activeCategory);
  const visibleStudents = filteredStudents.filter(
    (student) =>
      activeCategory === "all" || getStudentCategoryKey(student.notes) === activeCategory
  );
  const totalMonthlyOutstandingAllCategories = filteredStudents.reduce(
    (total, student) => total + readMonthlyOutstanding(student, period),
    0
  );
  const studentsWithMonthlyCharge = visibleStudents.filter((student) =>
    student.charges.some((charge) => charge.periodLabel === period && charge.status !== "CANCELED")
  ).length;
  const consolidatedStudents = visibleStudents.filter((student) =>
    readMonthlyConsolidated(student, period)
  ).length;
  const totalMonthlyOutstanding = visibleStudents.reduce(
    (total, student) => total + readMonthlyOutstanding(student, period),
    0
  );
  const studentsPendingThisMonth = visibleStudents.filter(
    (student) => readMonthlyOutstanding(student, period) > 0
  ).length;

  const totalOutstanding = students.reduce(
    (studentTotal, student) =>
      studentTotal +
      student.charges.reduce((chargeTotal, charge) => chargeTotal + charge.outstandingCents, 0),
    0
  );
  const totalGuardians = students.reduce(
    (guardianTotal, student) => guardianTotal + student.guardians.length,
    0
  );
  const studentsWithBalance = students.filter((student) =>
    student.charges.some((charge) => charge.outstandingCents > 0)
  ).length;

  return (
    <section className="stack">
      <section className="app-header">
        <div className="section-heading">
          <SectionHeader
            eyebrow="Alumnos"
            title="Plantel academico y control de deuda"
            description="La base de alumnos se presenta como una mesa de control limpia, con lectura rapida de apoderados, cargos y deuda abierta."
          />
          <Link href="/app/students/new" className="button">
            Nuevo alumno
          </Link>
        </div>

        <div className="badge-row">
          <div className="stat-chip featured">
            <span className="stat-chip-label">Plantel</span>
            <strong>{students.length}</strong>
            Jugadores registrados en la academia.
          </div>
          <div className="stat-chip">
            <span className="stat-chip-label">Apoderados</span>
            <strong>{totalGuardians}</strong>
            Apoderados vinculados.
          </div>
          <div className="stat-chip">
            <span className="stat-chip-label">Saldo abierto</span>
            <strong>{formatCurrencyFromCents(totalOutstanding)}</strong>
            Deuda total abierta.
          </div>
        </div>
      </section>

      <section className="summary-grid">
        <article className="summary-card">
          <span className="eyebrow">Lectura diaria</span>
          <strong>Cuenta, responsables y saldo</strong>
          <p>La tabla prioriza lectura rapida para saber quien debe, quien responde y donde actuar.</p>
        </article>
        <article className="summary-card">
          <span className="eyebrow">Control academico</span>
          <strong>{filteredStudents.length} alumnos en pantalla</strong>
          <p>Puedes cruzar nombre, codigo o apoderado sin perder claridad ni densidad operativa.</p>
        </article>
        <article className="summary-card">
          <span className="eyebrow">Salud de caja</span>
          <strong>{studentsWithBalance} cuentas con saldo</strong>
          <p>Los estados dejan visible si la relacion financiera esta al dia o necesita seguimiento.</p>
        </article>
      </section>

      <form className="toolbar" method="get">
        <div className="toolbar-group">
          <div className="toolbar-field">
            <label htmlFor="student-query">Buscar</label>
            <input
              id="student-query"
              name="q"
              defaultValue={readTextParam(params.q)}
              className="toolbar-input"
              placeholder="Buscar por alumno, codigo o apoderado"
            />
          </div>
          <div className="toolbar-field">
            <label htmlFor="student-balance">Estado de cuenta</label>
            <select
              id="student-balance"
              name="balance"
              defaultValue={debtFilter}
              className="toolbar-select"
            >
              <option value="">Todos</option>
              <option value="con-saldo">Con saldo pendiente</option>
              <option value="al-dia">Al dia</option>
            </select>
          </div>
          <div className="toolbar-field">
            <label htmlFor="student-period">Revision mensual</label>
            <input
              id="student-period"
              name="period"
              type="month"
              defaultValue={period}
              className="toolbar-input"
            />
          </div>
        </div>
        <div className="toolbar-actions">
          <button className="button button-small" type="submit">
            Aplicar filtros
          </button>
          <a className="button-secondary button-small" href="/app/students">
            Limpiar
          </a>
        </div>
      </form>

      <section className="app-card stack student-monthly-review">
        <div className="section-heading">
          <div className="section-copy">
            <span className="eyebrow">Revision mensual</span>
            <h2 className="card-title">Deuda mensual por categoria</h2>
            <p className="section-description compact">
              {reviewPeriodLabel} | {activeCategoryLabel}
            </p>
          </div>
          <p className="toolbar-note">{visibleStudents.length} alumnos visibles en esta revision.</p>
        </div>

        <div className="student-category-tabs" aria-label="Categorias de revision mensual">
          <a
            className={`student-category-tab${activeCategory === "all" ? " active" : ""}`}
            href={buildStudentsHref(params, { category: null })}
          >
            <strong>Todas</strong>
            <span>{formatCurrencyFromCents(totalMonthlyOutstandingAllCategories)} pendiente</span>
          </a>
          {categoryTabs.map((category) => (
            <a
              key={category.key}
              className={`student-category-tab${activeCategory === category.key ? " active" : ""}`}
              href={buildStudentsHref(params, { category: category.key })}
            >
              <strong>{category.label}</strong>
              <span>
                {category.students} alumno{category.students === 1 ? "" : "s"} |{" "}
                {formatCurrencyFromCents(category.monthlyOutstandingCents)}
              </span>
            </a>
          ))}
        </div>

        <div className="student-monthly-summary-grid">
          <article className="student-summary-card">
            <span className="stat-chip-label">Saldo del mes</span>
            <strong>{formatCurrencyFromCents(totalMonthlyOutstanding)}</strong>
            Total pendiente del periodo seleccionado.
          </article>
          <article className="student-summary-card">
            <span className="stat-chip-label">Deuda consolidada</span>
            <strong>{consolidatedStudents}</strong>
            Alumnos con el mes completamente cerrado.
          </article>
          <article className="student-summary-card">
            <span className="stat-chip-label">Con cargo del mes</span>
            <strong>{studentsWithMonthlyCharge}</strong>
            Alumnos con mensualidad emitida en este periodo.
          </article>
          <article className="student-summary-card">
            <span className="stat-chip-label">Pendientes</span>
            <strong>{studentsPendingThisMonth}</strong>
            Alumnos que aun arrastran saldo del mes.
          </article>
        </div>
      </section>

      <StudentsCrudPanel
        initialStudents={visibleStudents}
        isFiltered={query !== "" || debtFilter !== "" || activeCategory !== "all"}
        reviewPeriod={period}
        reviewPeriodLabel={reviewPeriodLabel}
        activeCategoryLabel={activeCategoryLabel}
      />
    </section>
  );
}
