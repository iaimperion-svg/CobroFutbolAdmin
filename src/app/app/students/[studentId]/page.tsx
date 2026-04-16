import Link from "next/link";
import { StudentUpsertForm } from "@/components/students/student-upsert-form";
import { SectionHeader } from "@/components/ui/section-header";
import { requireSession } from "@/server/auth/session";
import { getStudentById, listGuardiansForStudentForm } from "@/server/services/students.service";

type ParamsInput = Promise<{
  studentId: string;
}>;

export default async function EditStudentPage(props: { params: ParamsInput }) {
  const session = await requireSession();
  const params = await props.params;
  const [student, guardians] = await Promise.all([
    getStudentById(params.studentId, session.schoolId),
    listGuardiansForStudentForm(session.schoolId)
  ]);

  return (
    <section className="stack">
      <div className="section-heading">
        <SectionHeader
          eyebrow="Alumnos"
          title={`Editar ${student.fullName}`}
          description="Actualiza los datos del alumno y su apoderado principal fuera del listado para mantener la vista de alumnos enfocada en control y busqueda."
        />
        <Link href="/app/students" className="button-secondary">
          Volver al listado
        </Link>
      </div>

      <StudentUpsertForm guardianOptions={guardians} initialStudent={student} />
    </section>
  );
}
