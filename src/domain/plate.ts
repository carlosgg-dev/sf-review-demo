export class InvalidPlate extends Error {}

const SEPARATORS = /[ -]/g;
const NORMALISED_PLATE = /^[A-Za-z0-9]{2,10}$/;

/**
 * Removing only spaces and hyphens before the check leaves any other character in place, so it is
 * rejected before upper-casing could turn it into an ASCII letter.
 */
export function normalisePlate(typed: string): string {
  const plate = typed.replace(SEPARATORS, "");
  if (!NORMALISED_PLATE.test(plate)) {
    throw new InvalidPlate();
  }
  return plate.toUpperCase();
}
