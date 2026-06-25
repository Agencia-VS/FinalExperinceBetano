import { createBrowserClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Cliente para componentes de cliente (browser).
export function createBrowser() {
  return createBrowserClient(url, anonKey);
}
