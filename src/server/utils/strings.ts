export function normalizeText(input: string | null | undefined) {
  return (input ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenOverlapScore(a: string | null | undefined, b: string | null | undefined) {
  const leftTokens = new Set(normalizeText(a).split(" ").filter(Boolean));
  const rightTokens = new Set(normalizeText(b).split(" ").filter(Boolean));

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let matches = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      matches += 1;
    }
  }

  return matches / Math.max(leftTokens.size, rightTokens.size);
}

export function compactPhone(input: string | null | undefined) {
  return (input ?? "").replace(/[^\d+]/g, "");
}
