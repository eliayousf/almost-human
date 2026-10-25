/// <reference types="vite/client" />
declare const __CAST_MEDIA_READY__: boolean;

interface ImportMetaEnv {
  readonly VITE_CONVEX_URL?: string;
  readonly VITE_INDEPENDENT_PLAYTEST_TABS?: string;
  /** "true" ONLY after the strict backend is deployed and integration is permitted. */
  readonly VITE_STRICT_PAIR?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
