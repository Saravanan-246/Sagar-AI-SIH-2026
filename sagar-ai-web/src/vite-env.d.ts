/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend URL. Required for production builds; normally unset in
   * development (see services/api/apiBaseUrl.ts). */
  readonly VITE_API_BASE_URL?: string;
  /** "true" shows the developer diagnostics panel in a production build. */
  readonly VITE_SHOW_DIAGNOSTICS?: string;
}
