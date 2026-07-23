/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_MAP_STYLE_URL?: string;
  readonly VITE_APP_NAME?: string;
  readonly VITE_EL_POLLON_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
