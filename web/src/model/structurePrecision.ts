export const STRUCTURE_DECIMAL_PLACES = 16;
export const STRUCTURE_ZERO_TOLERANCE = 0.5 * 10 ** -STRUCTURE_DECIMAL_PLACES;

const STRUCTURE_NUMBER_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: STRUCTURE_DECIMAL_PLACES,
  minimumFractionDigits: 0,
  notation: "standard",
  useGrouping: false,
});

export function formatStructureNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }

  const normalizedValue =
    Math.abs(value) < STRUCTURE_ZERO_TOLERANCE || Object.is(value, -0) ? 0 : value;
  return STRUCTURE_NUMBER_FORMATTER.format(normalizedValue);
}
