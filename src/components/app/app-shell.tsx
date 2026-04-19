"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoutButton } from "@/components/auth/logout-button";
import { BrandMark } from "@/components/brand/brand-mark";
import type { SessionPayload } from "@/server/auth/session";

type NavIcon = "panel" | "revision" | "mensual" | "alumnos" | "comprobantes";

const links = [
  {
    href: "/app",
    label: "Panel",
    description: "Resumen del mes",
    icon: "panel"
  },
  {
    href: "/app/reviews/monthly",
    label: "Cobro mensual",
    description: "Categorías y saldo",
    icon: "mensual"
  },
  {
    href: "/app/reviews",
    label: "Revisión de pago",
    description: "Resolución manual",
    icon: "revision"
  },
  {
    href: "/app/receipts",
    label: "Comprobantes",
    description: "Ingreso y trazabilidad",
    icon: "comprobantes"
  },
  {
    href: "/app/students",
    label: "Alumnos",
    description: "Base operativa",
    icon: "alumnos"
  }
] satisfies Array<{
  href: Route;
  label: string;
  description: string;
  icon: NavIcon;
}>;

function NavigationIcon(props: { icon: NavIcon }) {
  switch (props.icon) {
    case "panel":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 5.5h7v5H4zM13 5.5h7v9h-7zM4 12.5h7V19H4zM13 16h7v3h-7z" />
        </svg>
      );
    case "revision":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 4h9l5 5v11H5zM13 4v5h5M8 13l2.2 2.2L16 9.4" />
        </svg>
      );
    case "mensual":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 6h16M7 3v6M17 3v6M5 10h14v10H5zM8 14h3M13 14h3M8 18h3" />
        </svg>
      );
    case "alumnos":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 12a3.5 3.5 0 1 0-3.5-3.5A3.5 3.5 0 0 0 12 12ZM5 19a6.5 6.5 0 0 1 13 0M18.5 12.5a2.5 2.5 0 1 0-2.3-3.5M18 15.5A4.7 4.7 0 0 1 22 19" />
        </svg>
      );
    case "comprobantes":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 4h10l3 3v13H4V4zM14 4v4h4M8 12h8M8 16h5" />
        </svg>
      );
  }
}

export function AppShell(props: {
  session: SessionPayload;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const isDashboardHome = pathname === "/app";
  const isLinkActive = (href: Route) =>
    href === "/app" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  const academyName = props.session.schoolSlug
    .split("-")
    .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
    .join(" ");
  const currentLink =
    [...links]
      .sort((left, right) => right.href.length - left.href.length)
      .find((link) => isLinkActive(link.href)) ??
    links[0]!;

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isSidebarOpen) {
      document.body.style.overflow = "";
      return;
    }

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = "";
    };
  }, [isSidebarOpen]);

  return (
    <div className={`app-layout${isSidebarOpen ? " sidebar-open" : ""}`}>
      <button
        type="button"
        className={`app-shell-backdrop${isSidebarOpen ? " active" : ""}`}
        aria-label="Cerrar menú"
        onClick={() => setIsSidebarOpen(false)}
      />

      <aside className={`sidebar${isSidebarOpen ? " open" : ""}`} id="app-sidebar">
        <div className="sidebar-top">
          <BrandMark compact variant="dark" />
          <div className="sidebar-context">
            <p className="sidebar-academy">{academyName}</p>
            <p className="sidebar-userline">
              {props.session.fullName}
              {" | "}
              {props.session.email}
            </p>
          </div>
        </div>

        <nav className="sidebar-nav" id="app-sidebar-navigation">
          {links.map((link) => {
            const isActive = currentLink.href === link.href;

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`nav-link${isActive ? " active" : ""}`}
                aria-current={isActive ? "page" : undefined}
              >
                <div className="nav-link-content">
                  <span className="nav-icon" aria-hidden="true">
                    <NavigationIcon icon={link.icon} />
                  </span>
                  <span className="nav-text">
                    <strong>{link.label}</strong>
                    <span>{link.description}</span>
                  </span>
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <LogoutButton fullWidth />
        </div>
      </aside>

      <main className="app-main">
        <header className="shell-header shell-header-minimal">
          <div className="shell-mobile-row">
            <button
              type="button"
              className="shell-mobile-menu-button"
              aria-label="Abrir menú"
              aria-expanded={isSidebarOpen ? "true" : "false"}
              aria-controls="app-sidebar"
              onClick={() => setIsSidebarOpen(true)}
            >
              <span />
              <span />
              <span />
            </button>

            <div className="shell-mobile-copy">
              <span className="eyebrow">CobroFutbol</span>
              <h2 className="shell-title shell-title-mobile">
                {isDashboardHome ? "Panel" : currentLink.label}
              </h2>
            </div>
          </div>

          {isDashboardHome ? (
            <h2 className="shell-title shell-title-desktop">Panel</h2>
          ) : (
            <div className="stack shell-desktop-copy" style={{ gap: 8 }}>
              <span className="eyebrow">Academia</span>
              <h2 className="shell-title shell-title-desktop">{currentLink.label}</h2>
            </div>
          )}
        </header>
        {props.children}
      </main>
    </div>
  );
}

