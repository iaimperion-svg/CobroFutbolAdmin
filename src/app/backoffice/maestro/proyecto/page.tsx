import Link from "next/link";
import { redirect } from "next/navigation";
import { MasterSidebar } from "@/app/backoffice/maestro/MasterSidebar";
import { hasOnboardingReviewAccess } from "@/server/auth/onboarding-review";

export const dynamic = "force-dynamic";

const projectSnapshot = {
  updatedAtLabel: "30 de abril de 2026",
  overallProgress: 96,
  summary:
    "Representante, Kapitan, panel de escuela y backoffice maestro ya tienen base operativa real. Kapitan valido en produccion el flujo conversacional para pagos familiares variables y el proyecto ya cuenta con skills operativas para produccion, validacion, datos, UI, testing y rutina diaria.",
  tracks: [
    {
      title: "Ingreso / Representante",
      progress: 98,
      status: "Operativo estable",
      tone: "success" as const,
      detail:
        "Solicitud, correo, bot de onboarding, comprobante, aprobacion, activacion y acceso al panel ya funcionan en produccion."
    },
    {
      title: "Kapitan / Mensualidades",
      progress: 95,
      status: "Validado con pauta",
      tone: "success" as const,
      detail:
        "Resuelve cuenta destino, pagos familiares de N alumnos o N mensualidades, abonos parciales, excedentes y varios periodos. Ya valido en produccion la pregunta de pagador y se ejecuto la pauta validar con evidencia."
    },
    {
      title: "Panel de escuela",
      progress: 86,
      status: "Operativo en consolidacion",
      tone: "neutral" as const,
      detail:
        "Dashboard base operativo, configuracion inicial obligatoria, setup bancario y detalle visual de aplicacion del pago listos. Queda seguir puliendo experiencia y configuraciones."
    },
    {
      title: "Backoffice maestro CobroFutbol",
      progress: 94,
      status: "Centro operativo",
      tone: "success" as const,
      detail:
        "Ya concentra resumen, clientes, ingresos, onboarding, proyecto, mantenedores, mensualidad CobroFutbol, cuenta Mercado Pago, login admin, cierre de sesion y runbooks operativos mediante skills."
    }
  ],
  completed: [
    "Bot Representante separado y operativo para onboarding.",
    "Correccion del OCR de onboarding en produccion.",
    "Eliminacion del bucle de respuestas repetidas en Telegram.",
    "Datos reales de transferencia configurados para onboarding.",
    "Reenvio de activacion y reenvio de acceso al bot desde backoffice.",
    "Correo de onboarding mejorado para movil y Telegram Web.",
    "Cambio de lenguaje visible desde alta hacia ingreso.",
    "Configuracion inicial bloqueante para correo operativo y cuenta bancaria.",
    "Escuela real configurada con correo operativo y cuenta bancaria en produccion.",
    "Webhook de Telegram sin schoolSlug fijo y resolucion por cuenta destino activa.",
    "Extraccion correcta de cuenta destino en comprobantes Tapp.",
    "Alta de hermanos reutilizando el mismo apoderado principal.",
    "Conciliacion familiar general para 2 o mas hermanos con el mismo apoderado.",
    "Horizonte de mensualidades futuras por alumno y detalle visual de aplicacion del pago.",
    "Backoffice maestro con resumen, clientes, ingresos, mantenedores y proyecto.",
    "Pago familiar variable validado en produccion: comprobante por 90.000 aplicado a 3 mensualidades de Academia 3 palitos mediante confirmacion de pagador.",
    "Plan docs/validar.md ejecutado en VPS con evidencia de contenedores, despliegue, tests automatizados y base de datos.",
    "Acciones de revision bloqueadas para comprobantes ya conciliados o aprobados, evitando reprocesar pagos cerrados desde la UI.",
    "Set base de 10 Agent Skills instalado localmente y en el VPS para produccion, validar, Kapitan, onboarding, maestro finanzas, webhooks, datos Prisma, operacion diaria, testing y UI."
  ],
  inProgress: [
    "Operar el primer ciclo real completo: crear cobro, recibir pago CobroFutbol, registrar pago y verificar cambio de estado.",
    "Pruebas reales adicionales de Kapitan con pago parcial, excedente, comprobante ambiguo y grupos familiares de distinto tamano.",
    "Agregar test automatizado especifico para receipt-resolution.service y resolucion de prompts SELECT_PAYER."
  ],
  nextSteps: [
    "Crear y registrar la primera mensualidad CobroFutbol real de una escuela desde el maestro.",
    "Agregar test automatizado para receipt-resolution.service y repetir validar.",
    "Ejecutar pruebas reales de pago parcial, excedente y comprobante ambiguo usando el plan docs/validar.md.",
    "Usar la skill cobrofutbol-operacion-diaria para revisar alertas, ingresos, pagos CF y clientes pendientes."
  ]
};

function getToneClass(tone: "success" | "warning" | "neutral" | "danger") {
  switch (tone) {
    case "success":
      return "is-success";
    case "warning":
      return "is-warning";
    case "danger":
      return "is-danger";
    case "neutral":
    default:
      return "is-neutral";
  }
}

export default async function BackofficeProjectStatusPage() {
  if (!(await hasOnboardingReviewAccess())) {
    redirect("/backoffice/onboarding" as never);
  }

  const trackAverage = Math.round(
    projectSnapshot.tracks.reduce((total, track) => total + track.progress, 0) / projectSnapshot.tracks.length
  );

  return (
    <main className="cf-master cf-master-silver project-status-shell">
      <MasterSidebar active="proyecto" subtitle="Proyecto" />

      <section className="cf-master-main">
        <section className="stack onboarding-review-frame">
          <section className="shell-header stack project-status-header project-status-material-header">
            <div className="project-status-topbar">
              <div className="stack project-status-heading project-status-heading-stack">
                <span className="eyebrow">Backoffice proyecto</span>
                <h1 className="shell-title onboarding-review-title">Estado de avance</h1>
                <p className="muted project-status-summary">{projectSnapshot.summary}</p>
              </div>

              <div className="project-status-actions">
                <a href="/backoffice/maestro" className="button-secondary button-small">
                  Ver maestro
                </a>
                <Link href="/backoffice/maestro/ingresos" className="button-secondary button-small">
                  Ver ingresos
                </Link>
              </div>
            </div>

            <div className="project-status-meta-grid">
              <article className="project-status-meta-card">
                <span>Avance general</span>
                <strong>{projectSnapshot.overallProgress}%</strong>
                <small>Panorama operativo actual</small>
              </article>
              <article className="project-status-meta-card">
                <span>Frentes activos</span>
                <strong>{projectSnapshot.tracks.length}</strong>
                <small>Ingreso, panel, Kapitan y backoffice</small>
              </article>
              <article className="project-status-meta-card">
                <span>Promedio interno</span>
                <strong>{trackAverage}%</strong>
                <small>Madurez media entre modulos</small>
              </article>
            </div>
          </section>

          <section className="project-status-hero">
            <article className="app-card project-status-progress-card project-status-material-card">
              <div className="project-status-progress-copy">
                <span className="eyebrow">Avance general</span>
                <div className="project-status-progress-head">
                  <strong>{projectSnapshot.overallProgress}%</strong>
                  <span>Actualizado: {projectSnapshot.updatedAtLabel}</span>
                </div>
                <p className="muted project-status-progress-note">
                  El ingreso ya esta practicamente cerrado. El mayor salto de hoy fue dejar operacion real por escuela,
                  cuenta destino, pagos familiares, validacion con evidencia y skills operativas funcionando como memoria de proyecto.
                </p>
              </div>

              <div
                className="project-status-progress-bar"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={projectSnapshot.overallProgress}
                aria-label="Avance general del proyecto"
              >
                <span style={{ width: `${projectSnapshot.overallProgress}%` }} />
              </div>
            </article>
          </section>

          <section className="project-status-grid">
            {projectSnapshot.tracks.map((track) => (
              <article key={track.title} className={`app-card project-status-card project-status-material-card ${getToneClass(track.tone)}`}>
                <div className="project-status-card-top">
                  <div className="stack project-status-card-heading">
                    <span className="eyebrow">Frente</span>
                    <h2 className="card-title project-status-card-title">{track.title}</h2>
                  </div>
                  <span className={`project-status-pill ${getToneClass(track.tone)}`}>{track.status}</span>
                </div>
                <strong className="project-status-card-value">{track.progress}%</strong>
                <p className="muted">{track.detail}</p>
                <div className="project-status-track-meter" aria-hidden="true">
                  <span style={{ width: `${track.progress}%` }} />
                </div>
              </article>
            ))}
          </section>

          <section className="project-status-columns">
            <article className="app-card project-status-list-card project-status-material-card">
              <span className="eyebrow">Hecho</span>
              <h2 className="card-title project-status-list-title">Lo que ya cerramos</h2>
              <ul className="project-status-list">
                {projectSnapshot.completed.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>

            <article className="app-card project-status-list-card project-status-material-card">
              <span className="eyebrow">En curso</span>
              <h2 className="card-title project-status-list-title">Lo que estamos afinando</h2>
              <ul className="project-status-list">
                {projectSnapshot.inProgress.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>

            <article className="app-card project-status-list-card project-status-material-card">
              <span className="eyebrow">Siguiente paso</span>
              <h2 className="card-title project-status-list-title">Lo que sigue ahora</h2>
              <ol className="project-status-list project-status-list-ordered">
                {projectSnapshot.nextSteps.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            </article>
          </section>
        </section>
      </section>
    </main>
  );
}
