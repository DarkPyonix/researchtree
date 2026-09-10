/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** DarkPyonix OAuth App client ID (public value) */
  readonly VITE_GITHUB_CLIENT_ID?: string;
  /** Auth proxy base URL */
  readonly VITE_AUTH_PROXY_URL?: string;
  /** Whether to use PKCE for GitHub OAuth ("true"/"false") */
  readonly VITE_OAUTH_PKCE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
