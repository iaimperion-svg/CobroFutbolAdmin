import type { Metadata } from "next";
import "./globals.css";
import { env } from "@/server/config/env";

export const metadata: Metadata = {
  metadataBase: new URL(env.APP_URL),
  title: "CobroFutbol",
  description: "Gestion de cobros y conciliacion automatica para academias de futbol",
  icons: {
    icon: [{ url: "/brand/escudo.png", type: "image/png" }],
    shortcut: ["/brand/escudo.png"],
    apple: [{ url: "/brand/escudo.png", type: "image/png" }]
  },
  openGraph: {
    title: "CobroFutbol",
    description: "Gestion de cobros y conciliacion automatica para academias de futbol",
    images: ["/brand/logo_.png"]
  },
  twitter: {
    card: "summary_large_image",
    title: "CobroFutbol",
    description: "Gestion de cobros y conciliacion automatica para academias de futbol",
    images: ["/brand/logo_.png"]
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
