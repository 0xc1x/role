import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const edgeFiles = [
  "handle-order-event/index.ts",
  "handle-pickup-reminders/index.ts",
  "handle-weekly-summary/index.ts",
  "dispatch-nearby-offers/index.ts",
  "send-push-notification/index.ts",
  "handle-offer-created/index.ts",
];
const edgeSources = edgeFiles.map((file) =>
  readFileSync(join(import.meta.dir, file), "utf8"),
);

/**
 * Only the internal (cron/database-dispatched) functions authenticate with the
 * shared internal secret. send-push-notification is service-role authenticated
 * instead, so requiring the shared verifier there would be wrong.
 */
const INTERNAL_SECRET_FUNCTIONS = edgeFiles.filter(
  (file) => !file.startsWith("send-push-notification"),
);

/** The shared verifier every internal function must delegate to. */
const SHARED_VERIFIER_IMPORT =
  /import \{ isInternalDispatch \} from "\.\.\/_shared\/internal-auth\.ts";/;
const SHARED_VERIFIER_CALL = /await isInternalDispatch\((req|request)\)/;

describe("Edge privacy logging", () => {
  test("does not log provider/database messages or return raw DB errors", () => {
    for (const source of edgeSources) {
      expect(source).not.toMatch(/console\.(error|warn)\([^)]*\.message/);
      expect(source).not.toMatch(/message:\s*[^,}]+\.message/);
    }
  });

  test("no edge function hardcodes the internal secret or an anon key", () => {
    for (const source of edgeSources) {
      // A 64-hex literal is the shape of the internal secret; a JWT-shaped
      // string is the shape of a legacy anon key.
      expect(source).not.toMatch(/["'][0-9a-f]{64}["']/i);
      expect(source).not.toMatch(/["']eyJ[A-Za-z0-9_-]{20,}/);
      // The secret must be verified by the database, never assigned inline.
      expect(source).not.toMatch(/INTERNAL_SECRET\s*=\s*["']/);
    }
  });

  test("internal functions delegate the secret check to the shared verifier", () => {
    // Platform secret injection is not guaranteed for secrets provisioned
    // through SQL, so no function may read the value from Deno.env anymore:
    // the database compares it and only a boolean comes back.
    for (const file of INTERNAL_SECRET_FUNCTIONS) {
      const source = readFileSync(join(import.meta.dir, file), "utf8");
      expect(source, `${file} must import the shared verifier`).toMatch(
        SHARED_VERIFIER_IMPORT,
      );
      expect(source, `${file} must call the shared verifier`).toMatch(
        SHARED_VERIFIER_CALL,
      );
      expect(source).not.toMatch(/Deno\.env\.get\("INTERNAL_SECRET"\)/);
    }
  });

  test("send-push-notification stays service-role authenticated", () => {
    const source = readFileSync(
      join(import.meta.dir, "send-push-notification/index.ts"),
      "utf8",
    );
    expect(source).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(source).not.toMatch(/Deno\.env\.get\("INTERNAL_SECRET"\)/);
    expect(source).not.toMatch(SHARED_VERIFIER_IMPORT);
  });

  test("every internal function requires POST and fails closed on an unverified secret", () => {
    for (const file of INTERNAL_SECRET_FUNCTIONS) {
      const source = readFileSync(join(import.meta.dir, file), "utf8");
      expect(source).toMatch(/req\.method !== "POST"|request\.method !== "POST"/);
      // The guard is the negated verifier: a missing header, an RPC error, or
      // any non-true result all land in the 401 branch below.
      expect(source).toMatch(/if\s*\(!\(await isInternalDispatch\((?:req|request)\)\)\)/);
      expect(source).toMatch(
        /\{ error: "Unauthorized" \},\s*\{ status: 401 \}/,
      );
    }
  });

  test("no edge function imports a private helper outside _shared", () => {
    for (const file of edgeFiles) {
      const source = readFileSync(join(import.meta.dir, file), "utf8");
      const imports = [...source.matchAll(/from "(\.\.?\/[^"]+)"/g)].map(
        (m) => m[1] ?? "",
      );
      for (const spec of imports) {
        expect(spec).toMatch(/^\.\.\/_shared\//);
      }
    }
  });
});

describe("cron job slugs match deployed Edge Function slugs", () => {
  const MIGRATIONS_DIR = join(import.meta.dir, "..", "migrations");

  /** Every migration in filename order, concatenated. */
  const ALL_MIGRATIONS = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n");

  // The cron rewrite lives in the Vault boundary migration. Later migrations
  // extend the dispatcher allowlist, so slug coverage reads all of them.
  const CRON_MIGRATION = readFileSync(
    join(
      MIGRATIONS_DIR,
      "20260925163235_client_read_boundaries_vault_secrets.sql",
    ),
    "utf8",
  );

  /** Cron jobname -> Edge Function slug, as deployed. */
  const CRON_TO_SLUG: Record<string, string> = {
    pickup_reminders_push: "handle-pickup-reminders",
    weekly_summary_push: "handle-weekly-summary",
    "dispatch-nearby-offers": "dispatch-nearby-offers",
  };

  test("every rewritten cron command dispatches the real slug", () => {
    for (const [jobName, slug] of Object.entries(CRON_TO_SLUG)) {
      const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(CRON_MIGRATION).toMatch(
        new RegExp(
          `select cron\\.schedule\\(\\s*'${jobName}'[\\s\\S]*?invoke_internal_edge_function\\('${escaped}'[\\s\\S]*?\\);`,
          "i",
        ),
      );
    }
  });

  test("no cron command passes a job name as the URL path", () => {
    for (const jobName of Object.keys(CRON_TO_SLUG)) {
      const escaped = jobName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // pickup_reminders_push / weekly_summary_push are job names, not slugs.
      if (slugForJob(jobName) === jobName) continue;
      expect(ALL_MIGRATIONS).not.toMatch(
        new RegExp(`invoke_internal_edge_function\\('${escaped}'`, "i"),
      );
    }
  });

  test("every allowlisted slug has a local source wired to the shared verifier", () => {
    // A dispatched slug with no local source 404s, and a local function with no
    // shared verifier 401s on every dispatch, which reads as a silent
    // notification outage. The secret itself is verified in the database, so
    // provisioning a function secret in Vault is no longer the auth path.
    const missingLocal: string[] = [];
    const missingVerifier: string[] = [];
    for (const file of INTERNAL_SECRET_FUNCTIONS) {
      const slug = file.split("/")[0] ?? "";
      if (!slug) continue;
      if (!existsSync(join(import.meta.dir, slug, "index.ts"))) {
        missingLocal.push(slug);
        continue;
      }
      const source = readFileSync(join(import.meta.dir, slug, "index.ts"), "utf8");
      if (!SHARED_VERIFIER_IMPORT.test(source)) missingVerifier.push(slug);
    }

    expect(missingLocal, "no local source for these dispatched slugs").toEqual([]);
    expect(
      missingVerifier,
      "these functions dispatch internally but do not import the shared verifier",
    ).toEqual([]);
  });

  test("every internal edge function is reachable from the dispatcher allowlist", () => {
    // The inverse of the test above, and the one that would have caught
    // handle-offer-created: a deployed, secret-authenticated function that no
    // migration allowlists is unreachable by anyone after the secret rotation.
    for (const file of INTERNAL_SECRET_FUNCTIONS) {
      const slug = file.split("/")[0];
      if (!slug) continue;
      expect(
        ALL_MIGRATIONS,
        `${slug} authenticates with the internal secret but is not in the dispatcher allowlist`,
      ).toMatch(new RegExp(`'${slug}'`, "i"));
    }
  });
});

function slugForJob(jobName: string): string {
  return (
    {
      pickup_reminders_push: "handle-pickup-reminders",
      weekly_summary_push: "handle-weekly-summary",
      "dispatch-nearby-offers": "dispatch-nearby-offers",
    }[jobName] ?? jobName
  );
}
