import { createClient } from "npm:@supabase/supabase-js@2";
import { safeErrorFields } from "./logging.ts";

let admin: ReturnType<typeof createClient> | null = null;

function adminClient() {
  if (!admin) {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}

/**
 * Authorizes a database -> Edge dispatch.
 *
 * The shared secret is verified inside the database and only a boolean travels
 * back: the value is never held in function memory and never crosses the wire.
 * This replaces env-based comparison because platform secret injection is not
 * guaranteed for secrets provisioned through SQL.
 *
 * Fails closed on a missing header, on an RPC error, and on a non-true result.
 */
export async function isInternalDispatch(req: Request): Promise<boolean> {
  const candidate = req.headers.get("x-internal-secret");
  if (!candidate) return false;
  const { data, error } = await adminClient().rpc(
    "internal_dispatch_secret_matches",
    { candidate },
  );
  if (error) {
    console.error(
      JSON.stringify({
        event: "internal_auth_lookup_failed",
        ...safeErrorFields(error),
      }),
    );
    return false;
  }
  return data === true;
}
