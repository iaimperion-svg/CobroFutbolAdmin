import { ensureCurrentPlatformInvoicesAction } from "@/app/backoffice/maestro/actions";
import { logoutOnboardingReviewAction } from "@/app/backoffice/onboarding/actions";

type MasterSidebarActive = "resumen" | "clientes" | "ingresos" | "onboarding" | "pagos" | "alertas" | "proyecto";

type MasterSidebarProps = {
  active?: MasterSidebarActive;
  subtitle?: string;
  currentPeriodLabel?: string;
};

const menuItems: Array<{ href: string; label: string; icon: string; key: MasterSidebarActive }> = [
  { href: "/backoffice/maestro", label: "Resumen", icon: "RS", key: "resumen" },
  { href: "/backoffice/maestro/clientes", label: "Clientes", icon: "CL", key: "clientes" },
  { href: "/backoffice/maestro/ingresos", label: "Ingresos", icon: "IN", key: "ingresos" },
  { href: "/backoffice/onboarding", label: "Onboarding", icon: "ON", key: "onboarding" },
  { href: "/backoffice/maestro/mantenedores/pagos", label: "Pagos CF", icon: "$", key: "pagos" },
  { href: "/backoffice/maestro/mantenedores/alertas", label: "Alertas", icon: "AL", key: "alertas" },
  { href: "/backoffice/maestro/proyecto", label: "Proyecto", icon: "%", key: "proyecto" }
];

export function MasterSidebar({ active, subtitle = "Backoffice", currentPeriodLabel }: MasterSidebarProps) {
  return (
    <aside className="cf-master-sidebar" aria-label="Menu backoffice maestro">
      <div className="cf-master-brand">
        <img src="/brand/logo_.png" alt="CobroFutbol" className="cf-master-logo" />
        <small>{subtitle}</small>
      </div>

      <nav className="cf-master-menu">
        {menuItems.map((item) => (
          <a key={item.href} href={item.href} className={active === item.key ? "is-active" : undefined}>
            <span>{item.icon}</span>
            <strong>{item.label}</strong>
          </a>
        ))}
      </nav>

      <div className="cf-master-sidebar-footer">
        {currentPeriodLabel ? (
          <form action={ensureCurrentPlatformInvoicesAction} className="cf-master-sidebar-action">
            <span>Accion rapida</span>
            <button type="submit">Crear cobros {currentPeriodLabel}</button>
          </form>
        ) : null}
        <form action={logoutOnboardingReviewAction} className="cf-master-sidebar-action cf-master-logout-action">
          <span>Sesion</span>
          <button type="submit">Cerrar sesion</button>
        </form>
      </div>
    </aside>
  );
}
