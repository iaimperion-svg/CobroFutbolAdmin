import Link from "next/link";
import { StudentsCrudPanel } from "@/components/students/students-crud-panel";
import { requireSession } from "@/server/auth/session";
import { listStudents } from "@/server/services/students.service";
import { formatCurrencyFromCents } from "@/server/utils/money";

type SearchParamsInput = Promise<Record<string, string | string[] | undefined>>;
type StudentListItem = Awaited<ReturnType<typeof listStudents>>[number];

function readTextParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value.trim() : "";
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

export default async function StudentsPage(props: { searchParams?: SearchParamsInput }) {
  const session = await requireSession();
  const students = await listStudents(session.schoolId);
  const params = props.searchParams ? await props.searchParams : {};
  const query = readTextParam(params.q).toLowerCase();
  const balanceFilter = readTextParam(params.balance);
  const categoryFilter = readTextParam(params.category).toLowerCase();
  const statusFilter = readTextParam(params.status);

  const categoryMap = new Map<string, { key: string; label: string; students: number; openCents: number }>();

  for (const student of students) {
    const key = getStudentCategoryKey(student.notes);
    const openCents = student.charges.reduce((total, charge) => total + charge.outstandingCents, 0);
    const existing =
      categoryMap.get(key) ?? {
        key,
        label: formatCategoryLabel(key),
        students: 0,
        openCents: 0
      };

    existing.students += 1;
    existing.openCents += openCents;
    categoryMap.set(key, existing);
  }

  const categoryOptions = [...categoryMap.values()].sort((left, right) =>
    left.label.localeCompare(right.label, "es-CL")
  );

  const filteredStudents = students.filter((student) => {
    const openCents = student.charges.reduce((total, charge) => total + charge.outstandingCents, 0);
    const categoryKey = getStudentCategoryKey(student.notes);
    const matchesQuery =
      query.length === 0 ||
      student.fullName.toLowerCase().includes(query) ||
      (student.externalCode ?? "").toLowerCase().includes(query) ||
      student.guardians.some((relation) => relation.guardian.fullName.toLowerCase().includes(query));
    const matchesBalance =
      balanceFilter === "" ||
      (balanceFilter === "con-saldo" && openCents > 0) ||
      (balanceFilter === "al-dia" && openCents === 0);
    const matchesCategory = categoryFilter === "" || categoryKey === categoryFilter;
    const matchesStatus =
      statusFilter === "" ||
      (statusFilter === "activos" && student.active) ||
      (statusFilter === "inactivos" && !student.active);

    return matchesQuery && matchesBalance && matchesCategory && matchesStatus;
  });

  const totalOutstanding = students.reduce(
    (studentTotal, student) =>
      studentTotal +
      student.charges.reduce((chargeTotal, charge) => chargeTotal + charge.outstandingCents, 0),
    0
  );
  const studentsWithBalance = students.filter((student) =>
    student.charges.some((charge) => charge.outstandingCents > 0)
  ).length;

  return (
    <section className="stack students-screen">
      <section className="students-header">
        <div className="students-header-copy">
          <span className="eyebrow">Alumnos</span>
          <h1 className="students-title">Base maestra de alumnos</h1>
          <p className="students-subtitle">
            Busca y revisa alumno, apoderado, contacto, estado y saldo abierto.
          </p>
        </div>
        <div className="students-header-actions">
          <Link href="/app/students/new" className="button">
            Nuevo alumno
          </Link>
        </div>
      </section>

      <section className="students-inline-stats">
        <span>{students.length} alumnos</span>
        <span>{studentsWithBalance} con saldo abierto</span>
        <span>{formatCurrencyFromCents(totalOutstanding)} saldo total</span>
      </section>

      <form className="toolbar students-toolbar" method="get">
        <div className="toolbar-group students-toolbar-group">
          <div className="toolbar-field">
            <label htmlFor="student-query">Buscar</label>
            <input
              id="student-query"
              name="q"
              defaultValue={readTextParam(params.q)}
              className="toolbar-input"
              placeholder="Buscar por alumno, código o apoderado"
            />
          </div>
          <div className="toolbar-field">
            <label htmlFor="student-category">Categoría</label>
            <select
              id="student-category"
              name="category"
              defaultValue={categoryFilter}
              className="toolbar-select"
            >
              <option value="">Todas</option>
              {categoryOptions.map((category) => (
                <option key={category.key} value={category.key}>
                  {category.label}
                </option>
              ))}
            </select>
          </div>
          <div className="toolbar-field">
            <label htmlFor="student-status">Estado</label>
            <select
              id="student-status"
              name="status"
              defaultValue={statusFilter}
              className="toolbar-select"
            >
              <option value="">Todos</option>
              <option value="activos">Activos</option>
              <option value="inactivos">Inactivos</option>
            </select>
          </div>
          <div className="toolbar-field">
            <label htmlFor="student-balance">Saldo</label>
            <select
              id="student-balance"
              name="balance"
              defaultValue={balanceFilter}
              className="toolbar-select"
            >
              <option value="">Todos</option>
              <option value="con-saldo">Con saldo abierto</option>
              <option value="al-dia">Al día</option>
            </select>
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

      <StudentsCrudPanel
        initialStudents={filteredStudents}
        isFiltered={
          query !== "" || balanceFilter !== "" || categoryFilter !== "" || statusFilter !== ""
        }
        reviewPeriod=""
        reviewPeriodLabel="Base maestra"
        activeCategoryLabel={categoryFilter ? formatCategoryLabel(categoryFilter) : "Todas las categorías"}
        mode="students"
      />
    </section>
  );
}
