"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LogoutButton(props: { fullWidth?: boolean }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogout() {
    setIsSubmitting(true);

    try {
      await fetch("/api/v1/auth/logout", {
        method: "POST"
      });
    } finally {
      router.replace("/login");
      router.refresh();
      setIsSubmitting(false);
    }
  }

  return (
    <button
      className={`button-secondary${props.fullWidth ? " button-block" : ""}`}
      type="button"
      onClick={handleLogout}
      disabled={isSubmitting}
    >
      {isSubmitting ? "Cerrando..." : "Cerrar sesion"}
    </button>
  );
}
