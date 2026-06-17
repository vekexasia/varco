export const SHARE_MAX_CLAIMS = 100;

export function parseShareClaims(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const claims = Number(value);
  return claims <= SHARE_MAX_CLAIMS ? claims : null;
}
