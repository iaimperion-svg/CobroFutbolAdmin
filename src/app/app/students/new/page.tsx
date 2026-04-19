import Link from "next/link";
import { StudentUpsertForm } from "@/components/students/student-upsert-form";
import { SectionHeader } from "@/components/ui/section-header";
import { requireSession } from "@/server/auth/session";
import { listGuardiansForStudentForm } from "@/server/services/students.service";

export default async function NewStudentPage() {
  const session = await requireSession();
  const guardians = await listGuardiansForStudentForm(session.schoolId);

  return (
    <section className="stack student-upsert-screen">
      <div className="section-heading">
        <SectionHeader
          eyebrow="Alumnos"
          title="Nuevo alumno"
          description="Registra al alumno y deja listo su apoderado principal."
        />
        <Link href="/app/students" className="button-secondary">
          Volver al listado
        </Link>
      </div>

      <StudentUpsertForm guardianOptions={guardians} />
    </section>
  );
}
