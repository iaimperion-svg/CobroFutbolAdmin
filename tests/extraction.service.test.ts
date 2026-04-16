import { describe, expect, it } from "vitest";
import { extractPaymentDataFromText } from "@/server/services/extraction.service";

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
    expect(result.reference).toBe("BG-03E-09473380");
    expect(result.paidAt?.toISOString()).toContain("2026-04-08");
  });

  it("reconstruye la referencia cuando OCR la parte en dos lineas", () => {
    const result = extractPaymentDataFromText(
      "Transferencia exitosa Monto $5.000 Codigo de transaccion BG-Y7G-\n13385961 Fecha 10/04/2026"
    );

    expect(result.amountCents).toBe(500000);
    expect(result.reference).toBe("BG-Y7G-13385961");
    expect(result.paidAt?.toISOString()).toContain("2026-04-10");
  });
});
