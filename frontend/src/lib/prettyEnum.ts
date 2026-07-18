/** "RTSP_AUTH" → "Rtsp auth" — generic fallback label for enum-ish strings. */
export function prettyEnum(value: string): string {
  const words = value.toLowerCase().split('_').join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
