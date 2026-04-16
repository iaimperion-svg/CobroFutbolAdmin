import { describe, expect, it } from "vitest";
import type { Charge, Guardian, Student } from "@prisma/client";
import { scoreCandidateAgainstReceipt } from "@/server/services/matching.service";
import type { ExtractedPaymentData } from "@/server/services/extraction.service";

describe("scoreCandidateAgainstReceipt", () => {
  it("prioriza coincidencias exactas por monto y apoderado", () => {
    const candidate = {
      id: "charge-1",
      schoolId: "school-1",
      studentId: "student-1",
      guardianId: "guardian-1",
      description: "Mensualidad marzo",
      periodLabel: "2026-03",
      dueDate: new Date("2026-03-10T12:00:00.000Z"),
      amountCents: 3500000,
      outstandingCents: 3500000,
      status: "OVERDUE",
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
      updatedAt: new Date("2026-03-01T00:00:00.000Z"),
      student: {
        id: "student-1",
        schoolId: "school-1",
        fullName: "Ignacio Perez",
        externalCode: "ALU-001",
        monthlyFeeCents: 3500000,
        billingDay: 10,
        birthDate: null,
        active: true,
        notes: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z")
      } satisfies Student,
      guardian: {
        id: "guardian-1",
        schoolId: "school-1",
        fullName: "Andrea Perez",
        phone: "+56911111111",
        email: null,
        nationalId: null,
        preferredChannel: "WHATSAPP",
        metadata: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z")
      } satisfies Guardian
    } satisfies Charge & { student: Student; guardian: Guardian | null };

    const extracted: ExtractedPaymentData = {
      amountCents: 3500000,
      paidAt: new Date("2026-03-09T12:00:00.000Z"),
      senderName: "Andrea Perez",
      reference: "8891",
      bankName: "banco estado",
      rawText: "Pago mensualidad marzo Ignacio Perez",
      confidence: 0.82
    };

    const score = scoreCandidateAgainstReceipt(candidate, extracted);
    expect(score.confidence).toBeGreaterThan(0.7);
    expect(score.rationale).toContain("monto exacto");
  });
});
