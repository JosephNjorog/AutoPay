interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_APP_URL: string;
  readonly VITE_WS_URL: string;
  readonly VITE_WEBAUTHN_RP_ID: string;
  readonly VITE_WEBAUTHN_ORIGIN: string;
  readonly VITE_ENVIRONMENT: string;
  readonly VITE_WALLETCONNECT_PROJECT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
