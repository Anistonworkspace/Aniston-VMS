// CR-6 — WGS-84 coordinate parsing/validation shared by the add-camera map
// pin-picker and its manual Latitude/Longitude fields. Kept as pure helpers so
// the sync/validation logic is unit-testable without spinning up MapLibre.

export const LATITUDE_MIN = -90;
export const LATITUDE_MAX = 90;
export const LONGITUDE_MIN = -180;
export const LONGITUDE_MAX = 180;

// Plain decimal only: optional leading '-', then digits with an optional
// fractional part (or a bare fractional like ".5"). Deliberately rejects
// incomplete input a user is mid-typing ("-", "12.") and non-decimal forms
// ("+90", "1e2", "90N") so the pin never jumps to a half-typed value.
const DECIMAL_PATTERN = /^-?(\d+(\.\d+)?|\.\d+)$/;

/**
 * Parse a user-entered coordinate string into a finite number.
 *
 * Returns `null` when the value is empty, incomplete, or not a plain decimal.
 * Accepts negatives and arbitrary-precision decimals (e.g. "-77.194580",
 * "28.6001480") — precision is preserved for persistence.
 */
export function parseCoordinate(value: string): number | null {
  const trimmed = value.trim();
  if (!DECIMAL_PATTERN.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function validateCoordinate(
  value: string,
  min: number,
  max: number,
  label: string
): string | null {
  if (value.trim() === '') return `${label} is required`;
  const parsed = parseCoordinate(value);
  if (parsed === null) return `${label} must be a decimal number`;
  if (parsed < min || parsed > max) return `${label} must be between ${min} and ${max}`;
  return null;
}

/** Returns an inline error message for an invalid latitude, or `null` if valid. */
export function validateLatitude(value: string): string | null {
  return validateCoordinate(value, LATITUDE_MIN, LATITUDE_MAX, 'Latitude');
}

/** Returns an inline error message for an invalid longitude, or `null` if valid. */
export function validateLongitude(value: string): string | null {
  return validateCoordinate(value, LONGITUDE_MIN, LONGITUDE_MAX, 'Longitude');
}

/** True only when BOTH strings hold an in-range coordinate — gates pin moves. */
export function areCoordinatesValid(latValue: string, lngValue: string): boolean {
  return validateLatitude(latValue) === null && validateLongitude(lngValue) === null;
}

/** Format a numeric coordinate (e.g. from the map pin) for a text input. */
export function formatCoordinate(value: number): string {
  return String(value);
}

/**
 * Format a latitude/longitude pair for read-only display, e.g.
 * "28.6001° N, 77.1946° E". Uses hemisphere letters (so the raw sign is never
 * ambiguous) and 4-decimal precision (~11 m — enough to place a fixed camera).
 * Returns `null` when either value is missing or non-finite, so callers can
 * fall back to a placeholder instead of rendering "NaN° N".
 */
export function formatCoordinates(
  latitude: number | null | undefined,
  longitude: number | null | undefined
): string | null {
  if (latitude == null || longitude == null) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const lat = `${Math.abs(latitude).toFixed(4)}° ${latitude >= 0 ? 'N' : 'S'}`;
  const lng = `${Math.abs(longitude).toFixed(4)}° ${longitude >= 0 ? 'E' : 'W'}`;
  return `${lat}, ${lng}`;
}
