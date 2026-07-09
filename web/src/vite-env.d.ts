/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_BASE_PATH?: string;
  readonly VITE_ITHUB_MOCK?: string;
  readonly VITE_ITHUB_PORTAL_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}