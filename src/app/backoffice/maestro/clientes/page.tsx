import { MasterSidebar } from "@/app/backoffice/maestro/MasterSidebar";
import { PlatformInvoiceStatus, SchoolStatus } from "@prisma/client";
import { requireOnboardingReviewAccess } from "@/server/auth/onboarding-review";
import {
  getBackofficeMasterSnapshot,
  getPlatformInvoiceStatusLabel
} from "@/server/services/backoffice-master.service";
import { formatCurrencyFromCents } from "@/server/utils/money";

export const dynamic = "force-dynamic";

type SearchParamsInput = Promise<Record<string, string | string[] | undefined>>;
type MasterSchoolRow = Awaited<ReturnType<typeof getBackofficeMasterSnapshot>>["schools"][number];
type Tone = "success" | "warning" | "danger" | "neutral";

function readTextParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function buildToneClass(tone: Tone) {
  switch (tone) {
    case "success": return "is-success";
    case "warning": return "is-warning";
    case "danger": return "is-danger";
    default: return "is-neutral";
  }
}

function getSchoolStatusLabel(status: SchoolStatus) {
  return status === SchoolStatus.ACTIVE ? "Activa" : "Inactiva";
}

function getPlatformTone(status: PlatformInvoiceStatus): Tone {
  if (status === PlatformInvoiceStatus.PAID) return "success";
  if (status === PlatformInvoiceStatus.OVERDUE) return "danger";
  if (status === PlatformInvoiceStatus.PENDING || status === PlatformInvoiceStatus.PARTIALLY_PAID) return "warning";
  return "neutral";
}

function getSetupMeta(school: MasterSchoolRow) {
  if (school.setupComplete) return { label: "Listo", tone: "success" as const };
  if (!school.operationsEmail && !school.defaultBankAccount) return { label: "Falta correo/cuenta", tone: "danger" as const };
  if (!school.operationsEmail) return { label: "Falta correo", tone: "warning" as const };
  return { label: "Falta cuenta", tone: "warning" as const };
}

export default async function BackofficeClientsPage(props: { searchParams?: SearchParamsInput }) {
  await requireOnboardingReviewAccess();
  const params = props.searchParams ? await props.searchParams : {};
  const query = readTextParam(params.q);
  const snapshot = await getBackofficeMasterSnapshot();
  const normalizedQuery = normalizeText(query);
  const schools = normalizedQuery
    ? snapshot.schools.filter((school) =>
        [school.name, school.slug, school.operationsEmail, school.defaultBankAccount?.bankName]
          .map((value) => normalizeText(value))
          .some((value) => value.includes(normalizedQuery))
      )
    : snapshot.schools;

  return (
    <main className="cf-master cf-master-silver cf-page-clients">
      <MasterSidebar active="clientes" subtitle="Clientes" currentPeriodLabel={snapshot.currentPeriodLabel} />

      <section className="cf-master-main">
        <header className="cf-master-hero cf-client-toolbar">
          <div className="cf-client-title"><span className="cf-page-mark">CL</span><div><span className="cf-master-kicker">Clientes</span><h1>Clientes</h1><p>Estado, datos y cobro de cada cliente.</p></div></div>
          <form className="cf-master-search" method="get">
            <label htmlFor="client-search">Buscar</label>
            <div>
              <input id="client-search" name="q" type="search" defaultValue={query} placeholder="Escuela, banco o correo" />
              <button type="submit">Buscar</button>
              {query ? <a href="/backoffice/maestro/clientes">Limpiar</a> : null}
            </div>
          </form>
        </header>

        <section className="cf-master-panel cf-saas-table-panel cf-client-table-card">
          <div className="cf-master-section-head"><div><span className="cf-master-kicker">Tabla</span><h2>Clientes</h2></div><p>{schools.length} resultado(s)</p></div>
          <div className="cf-saas-table-wrap">
            <table className="cf-saas-table">
              <thead><tr><th>Cliente</th><th>Estado</th><th>Datos</th><th>Pago CF</th><th>Accion</th><th /></tr></thead>
              <tbody>
                {schools.map((school) => {
                  const setup = getSetupMeta(school);
                  const platform = school.currentPlatformInvoice
                    ? { label: getPlatformInvoiceStatusLabel(school.currentPlatformInvoice.status), tone: getPlatformTone(school.currentPlatformInvoice.status), amount: formatCurrencyFromCents(school.currentPlatformInvoice.outstandingCents) }
                    : school.platformBillingActive
                      ? { label: "Sin cobro", tone: "warning" as const, amount: formatCurrencyFromCents(school.platformMonthlyExpectedCents) }
                      : { label: "Sin plan", tone: "neutral" as const, amount: "$0" };
                  return (
                    <tr key={school.id}>
                      <td><a href={`/backoffice/maestro/${encodeURIComponent(school.slug)}`} className="cf-saas-main-link"><span>{school.name}</span></a><small>{school.operationsEmail ?? "Sin correo"}</small></td>
                      <td><span className={`cf-line-status ${buildToneClass(school.healthTone)}`}>{school.healthLabel}</span><small>{getSchoolStatusLabel(school.status)}</small></td>
                      <td><span className={`cf-line-status ${buildToneClass(setup.tone)}`}>{setup.label}</span><small>{school.defaultBankAccount?.bankName ?? "Sin banco"}</small></td>
                      <td className="cf-saas-money-cell"><strong>{platform.amount}</strong><span className={`cf-line-status ${buildToneClass(platform.tone)}`}>{platform.label}</span></td>
                      <td><span className={`cf-line-status ${school.attentionScore > 0 ? "is-warning" : "is-success"}`}>{school.attentionScore > 0 ? "Revisar" : "OK"}</span></td>
                      <td><div className="cf-saas-actions"><a href={`/backoffice/maestro/${encodeURIComponent(school.slug)}`} aria-label={`Abrir ${school.name}`} title="Abrir cliente"><span className="cf-open-icon" aria-hidden="true" /></a></div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}
