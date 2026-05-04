import { describe, expect, it } from "vitest";
import { assessOnboardingReceipt, extractPaymentDataFromText } from "@/server/services/extraction.service";

describe("extractPaymentDataFromText", () => {
  it("extrae monto, fecha, banco y remitente desde texto semi estructurado", () => {
    const result = extractPaymentDataFromText(
      "Transferencia Banco Estado remitente Andrea Perez monto $35.000 fecha 09/03/2026 referencia 8891"
    );

    expect(result.amountCents).toBe(3500000);
    expect(result.bankName).toBe("banco estado");
    expect(result.senderName?.toLowerCase()).toContain("andrea");
    expect(result.reference).toBe("8891");
    expect(result.paidAt?.toISOString()).toContain("2026-03-09");
  });

  it("ignora numeros enormes de payloads externos que no son montos reales", () => {
    const result = extractPaymentDataFromText(
      "telegram payload file_id 8603000397 chat 703991111 comprobante sin monto"
    );

    expect(result.amountCents).toBeNull();
  });

  it("extrae datos clave desde OCR de comprobante de transferencia", () => {
    const result = extractPaymentDataFromText(
      "Transferencia exitosa Monto $154.190 Transferiste a Mauro Moreno Banco Scotiabank Azul Tipo de cuenta Cuenta Vista N de cuenta 50400500100343641 Fecha 08/04/2026 Hora 09:47 hrs. Codigo de transaccion BG-03E-09473380"
    );

    expect(result.amountCents).toBe(15419000);
    expect(result.senderName?.toLowerCase()).toContain("mauro moreno");
    expect(result.bankName).toBe("scotiabank azul");
    expect(result.destinationAccountNumber).toBe("50400500100343641");
    expect(result.reference).toBe("BG-03E-09473380");
    expect(result.paidAt?.toISOString()).toContain("2026-04-08");
  });

  it("prioriza la cuenta de destino cuando el comprobante trae cuenta origen y cuenta destino", () => {
    const result = extractPaymentDataFromText(
      "Transferencia exitosa Monto transferido $1.000 Desde MAURO ISAIAS MORENO ORMEÑO Tipo de cuenta Cuenta vista Tapp N de cuenta 13711865 Asunto 5 mensualidades de Gabriel y 5 de Mateo Para MAURO ISAIAS MORENO Banco Scotiabank Tipo de cuenta Cta Vista N de cuenta 500343641"
    );

    expect(result.amountCents).toBe(100000);
    expect(result.bankName).toBe("scotiabank");
    expect(result.destinationAccountNumber).toBe("500343641");
  });

  it("reconstruye la referencia cuando OCR la parte en dos lineas", () => {
    const result = extractPaymentDataFromText(
      "Transferencia exitosa Monto $5.000 Codigo de transaccion BG-Y7G-\n13385961 Fecha 10/04/2026"
    );

    expect(result.amountCents).toBe(500000);
    expect(result.reference).toBe("BG-Y7G-13385961");
    expect(result.paidAt?.toISOString()).toContain("2026-04-10");
  });

  it("extrae el monto desde OCR de comprobante Scotiabank con bloque 'Monto transferido'", () => {
    const result = extractPaymentDataFromText(
      "Scotiabank Comprobante de Transferencia Fecha 15 de diciembre de 2024 Numero de Operacion 123456789 Titular MAURO I. MORENO Correo MAURO.MORENO.O@GMAIL.COM Monto transferido $39.990 Pre-calentamiento de activacion CobroFutbol Referencia Pre-calentamiento CobroFutbol - Solicitud PG-UAJENA Transferencia Exitosa"
    );

    expect(result.amountCents).toBe(3999000);
    expect(result.bankName).toBe("scotiabank");
    expect(result.senderName).toBe("MAURO I. MORENO");
    expect(result.reference).toBe("PG-UAJENA");
  });

  it("extrae monto y cuenta visible desde comprobante TAP preprocesado por OCR", () => {
    const result = extractPaymentDataFromText(
      [
        "Comprobante de transferencia",
        "TAP - Estado: Transferencia enviada",
        "N operacion: QATAP-20260429-104914",
        "Fecha: 29-04-2026 02:16",
        "Monto transferido",
        "$90.000 CLP",
        "Datos del destinatario",
        "Titular mabro",
        "Correo operativo mmoreno@aeurus.cl",
        "Banco TAP",
        "Tipo de cuenta Cuenta Vista",
        "Numero visible 456789"
      ].join("\n")
    );

    expect(result.amountCents).toBe(9000000);
    expect(result.senderName).toBe("mabro");
    expect(result.bankName).toBe("tap");
    expect(result.destinationAccountNumber).toBe("456789");
    expect(result.reference).toBe("QATAP-20260429-104914");
  });

  it("usa un criterio distinto para onboarding y prioriza el codigo publico PG sobre el numero de operacion", () => {
    const result = extractPaymentDataFromText(
      "Scotiabank Comprobante de Transferencia Numero de Operacion 123456789 Titular MAURO I. MORENO Referencia Pre-calentamiento CobroFutbol - Solicitud PG-UAJENA Transferencia Exitosa",
      {
        profile: "onboarding_setup",
        expectedReference: "PG-UAJENA"
      }
    );

    expect(result.senderName).toBe("MAURO I. MORENO");
    expect(result.reference).toBe("PG-UAJENA");
  });

  it("evalua onboarding con criterios propios de monto esperado y codigo publico", () => {
    const extracted = extractPaymentDataFromText(
      "Comprobante de Transferencia Titular MAURO I. MORENO Monto transferido $39.990 Referencia Solicitud PG-UAJENA",
      {
        profile: "onboarding_setup",
        expectedReference: "PG-UAJENA"
      }
    );

    const assessment = assessOnboardingReceipt({
      extracted,
      expectedAmountCents: 3999000,
      expectedReference: "PG-UAJENA"
    });

    expect(assessment.outcome).toBe("exact_match");
    expect(assessment.amountMatchesExpected).toBe(true);
    expect(assessment.referenceMatchesExpected).toBe(true);
    expect(assessment.detectedReference).toBe("PG-UAJENA");
  });
});
