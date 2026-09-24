/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_API_URL?: string;
  /** "true" in the shared hosted build: hides self-host-only options. */
  readonly VITE_HOSTED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
