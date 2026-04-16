export function formatCurrencyFromCents(amountCents: number, currency = "CLP", locale = "es-CL") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(amountCents / 100);
}

export function sumAmounts(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}
