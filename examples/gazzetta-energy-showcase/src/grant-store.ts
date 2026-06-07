export type SavedShowcaseGrant = {
  authorityId: string;
  consumerPublicKey: string;
  requestId: string;
  pairingCode: string;
  status: "pending" | "approved";
  updatedAt: string;
};

export type ShowcaseGrantStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export const SHOWCASE_GRANT_KEY = "varco.energyShowcase.grant.v1";

export function loadShowcaseGrant(storage: ShowcaseGrantStorage, authorityId: string): SavedShowcaseGrant | null {
  const raw = storage.getItem(SHOWCASE_GRANT_KEY);
  if (!raw) return null;
  try {
    const grant = JSON.parse(raw) as SavedShowcaseGrant;
    if (grant.authorityId !== authorityId) return null;
    return grant;
  } catch {
    storage.removeItem(SHOWCASE_GRANT_KEY);
    return null;
  }
}

export function savePendingShowcaseGrant(
  storage: ShowcaseGrantStorage,
  input: Omit<SavedShowcaseGrant, "status" | "updatedAt">,
): SavedShowcaseGrant {
  const grant: SavedShowcaseGrant = { ...input, status: "pending", updatedAt: new Date().toISOString() };
  storage.setItem(SHOWCASE_GRANT_KEY, JSON.stringify(grant));
  return grant;
}

export function markShowcaseGrantApproved(storage: ShowcaseGrantStorage, authorityId: string): SavedShowcaseGrant | null {
  const grant = loadShowcaseGrant(storage, authorityId);
  if (!grant) return null;
  const approved: SavedShowcaseGrant = { ...grant, status: "approved", updatedAt: new Date().toISOString() };
  storage.setItem(SHOWCASE_GRANT_KEY, JSON.stringify(approved));
  return approved;
}

export function clearShowcaseGrant(storage: ShowcaseGrantStorage): void {
  storage.removeItem(SHOWCASE_GRANT_KEY);
}
