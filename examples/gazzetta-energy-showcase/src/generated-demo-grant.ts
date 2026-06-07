import type { SavedShowcaseGrant } from "./grant-store.js";

export type DemoGrantBundle = {
  authorityId: string;
  bridgeUrl: string;
  identity: {
    privateKey: string;
    publicKey: string;
  };
  grant: SavedShowcaseGrant;
};

export const DEMO_GRANT_BUNDLE: DemoGrantBundle | null = null;
