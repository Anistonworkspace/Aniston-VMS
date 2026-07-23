import { describe, it, expect } from 'vitest';
import {
  areCoordinatesValid,
  formatCoordinate,
  formatCoordinates,
  parseCoordinate,
  validateLatitude,
  validateLongitude,
} from '../coordinates';

describe('parseCoordinate', () => {
  it('parses integers, decimals, and negatives', () => {
    expect(parseCoordinate('0')).toBe(0);
    expect(parseCoordinate('90')).toBe(90);
    expect(parseCoordinate('-90')).toBe(-90);
    expect(parseCoordinate('28.600148')).toBe(28.600148);
    expect(parseCoordinate('-77.194580')).toBe(-77.19458);
  });

  it('preserves high-precision decimals', () => {
    expect(parseCoordinate('28.60014812345')).toBe(28.60014812345);
  });

  it('accepts a bare leading-dot fraction and trims surrounding whitespace', () => {
    expect(parseCoordinate('.5')).toBe(0.5);
    expect(parseCoordinate('-.5')).toBe(-0.5);
    expect(parseCoordinate('  28.6  ')).toBe(28.6);
  });

  it('returns null for empty, incomplete, or non-decimal input', () => {
    expect(parseCoordinate('')).toBeNull();
    expect(parseCoordinate('   ')).toBeNull();
    expect(parseCoordinate('-')).toBeNull();
    expect(parseCoordinate('12.')).toBeNull();
    expect(parseCoordinate('+90')).toBeNull();
    expect(parseCoordinate('1e2')).toBeNull();
    expect(parseCoordinate('abc')).toBeNull();
    expect(parseCoordinate('28.6N')).toBeNull();
  });
});

describe('validateLatitude', () => {
  it('accepts in-range values including the boundaries', () => {
    expect(validateLatitude('0')).toBeNull();
    expect(validateLatitude('90')).toBeNull();
    expect(validateLatitude('-90')).toBeNull();
    expect(validateLatitude('28.600148')).toBeNull();
    expect(validateLatitude('-89.999999')).toBeNull();
  });

  it('flags an empty value as required', () => {
    expect(validateLatitude('')).toBe('Latitude is required');
  });

  it('flags non-decimal input', () => {
    expect(validateLatitude('abc')).toBe('Latitude must be a decimal number');
    expect(validateLatitude('12.')).toBe('Latitude must be a decimal number');
  });

  it('flags out-of-range values', () => {
    expect(validateLatitude('90.0001')).toBe('Latitude must be between -90 and 90');
    expect(validateLatitude('-90.0001')).toBe('Latitude must be between -90 and 90');
    expect(validateLatitude('100')).toBe('Latitude must be between -90 and 90');
  });
});

describe('validateLongitude', () => {
  it('accepts in-range values including the boundaries', () => {
    expect(validateLongitude('0')).toBeNull();
    expect(validateLongitude('180')).toBeNull();
    expect(validateLongitude('-180')).toBeNull();
    expect(validateLongitude('77.194580')).toBeNull();
  });

  it('flags an empty value as required', () => {
    expect(validateLongitude('')).toBe('Longitude is required');
  });

  it('flags out-of-range values', () => {
    expect(validateLongitude('180.0001')).toBe('Longitude must be between -180 and 180');
    expect(validateLongitude('-181')).toBe('Longitude must be between -180 and 180');
    expect(validateLongitude('200')).toBe('Longitude must be between -180 and 180');
  });
});

describe('areCoordinatesValid', () => {
  it('is true only when both coordinates are valid', () => {
    expect(areCoordinatesValid('28.600148', '77.194580')).toBe(true);
    expect(areCoordinatesValid('28.600148', '')).toBe(false);
    expect(areCoordinatesValid('', '77.194580')).toBe(false);
    expect(areCoordinatesValid('91', '77.194580')).toBe(false);
    expect(areCoordinatesValid('28.6', '181')).toBe(false);
  });
});

describe('formatCoordinate', () => {
  it('renders a number as its plain string form', () => {
    expect(formatCoordinate(28.600148)).toBe('28.600148');
    expect(formatCoordinate(-77.19458)).toBe('-77.19458');
  });
});

describe('formatCoordinates', () => {
  it('renders a lat/lng pair with hemisphere letters and 4-decimal precision', () => {
    expect(formatCoordinates(28.600148, 77.19458)).toBe('28.6001° N, 77.1946° E');
  });

  it('uses S/W for negative values so the sign is never ambiguous', () => {
    expect(formatCoordinates(-33.8688, -151.2093)).toBe('33.8688° S, 151.2093° W');
    expect(formatCoordinates(0, 0)).toBe('0.0000° N, 0.0000° E');
  });

  it('returns null when either value is missing or non-finite', () => {
    expect(formatCoordinates(null, 77.19458)).toBeNull();
    expect(formatCoordinates(28.600148, null)).toBeNull();
    expect(formatCoordinates(undefined, undefined)).toBeNull();
    expect(formatCoordinates(Number.NaN, 77.19458)).toBeNull();
    expect(formatCoordinates(28.600148, Number.POSITIVE_INFINITY)).toBeNull();
  });
});
