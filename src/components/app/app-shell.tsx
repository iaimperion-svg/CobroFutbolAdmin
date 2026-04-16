"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/auth/logout-button";
import { BrandMark } from "@/components/brand/brand-mark";
import type { SessionPayload } from "@/server/auth/session";

type NavIcon = "panel" | "revision" | "mensual" | "alumnos" | "comprobantes";

const links = [
  {
    href: "/app",
    label: "Panel",
    description: "Caja y rendimiento",
    summary: "Lectura general de ingresos, deuda y automatizacion.",
    icon: "panel"
  },
  {
    href: "/app/reviews/monthly",
    label: "Revision mensual",
    description: "Deuda por categoria",
    summary: "Lectura mensual de deuda, categorias y consolidacion por alumno.",
    icon: "mensual"
  },
  {
    href: "/app/reviews",
    label: "Revision manual",
    description: "Casos tacticos",
    summary: "Validacion humana para comprobantes ambiguos o sensibles.",
    icon: "revision"
  },
  {
    href: "/app/students",
    label: "Alumnos",
    description: "Plantel y apoderados",
    summary: "Base academica con foco financiero y administrativo.",
    icon: "alumnos"
  },
  {
    href: "/app/receipts",
    label: "Comprobantes",
    description: "OCR y conciliacion",
    summary: "Radar operativo de cargas, extraccion y decisiones.",
    icon: "comprobantes"
  }
] satisfies Array<{
  href: Route;
  label: string;
  description: string;
  summary: string;
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
  const academyName = props.session.schoolSlug
    .split("-")
    .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
    .join(" ");
  const currentLink =
    [...links]
      .sort((left, right) => right.href.length - left.href.length)
      .find((link) => pathname === link.href || pathname.startsWith(`${link.href}/`)) ??
    links[0]!;

  return (
    <div className="app-layout">
      <aside className="sidebar">
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

        <nav className="sidebar-nav">
          {links.map((link) => {
            const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`nav-link${isActive ? " active" : ""}`}
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
          <div className="shell-header-top">
            <div className="stack" style={{ gap: 8 }}>
              <span className="eyebrow">Centro operativo</span>
              <h2 className="shell-title">{currentLink.label}</h2>
            </div>
            <div className="shell-header-actions">
              <LogoutButton />
            </div>
          </div>
          <p className="section-description compact">{currentLink.summary}</p>
        </header>
        {props.children}
      </main>
    </div>
  );
}

