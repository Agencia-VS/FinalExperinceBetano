import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Cliente para Server Components / Route Handlers (respeta sesión via cookies).
// Next.js 16: cookies() es asíncrono.
export async function createServer() {
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Llamado desde Server Component: ignorable, el proxy.ts refresca la sesión.
        }
      },
    },
  });
}

// Cliente admin con service role. SOLO en el servidor. Bypassa RLS.
export function createAdmin() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// PostgREST corta TODA lectura en 1000 filas (db-max-rows), también con
// service role. Para tablas que crecen con el evento (juego_trivia_answers:
// jugadores × preguntas supera 1000 a mitad de la trivia) hay que paginar.
// `page` recibe el rango inclusivo y DEBE ordenar por una columna estable
// (p. ej. .order("id")) para que las páginas no se solapen ni salten filas.
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const PAGE = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE) return rows;
  }
}
