export function selectManagementAccessToken(
  authorization: string | null,
  cookieToken: string | undefined,
): string | null {
  if (authorization !== null) {
    const match = /^Bearer ([^\s]+)$/.exec(authorization);
    return match?.[1] ?? null;
  }
  return cookieToken ?? null;
}
