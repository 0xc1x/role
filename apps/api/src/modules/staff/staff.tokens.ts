/**
 * The `service_role` Auth surface this module is allowed to use, and its token.
 *
 * ─── POR QUÉ ES UN TOKEN Y NO UN CLIENTE CONSTRUIDO DENTRO ────────────────────
 *
 * `BusinessesService` builds its Supabase client in the constructor out of
 * `ConfigService`, and that is fine for a service whose only auth call is
 * best-effort. This one is not: creating the access writes `auth.users`, and
 * `staff.service.spec.ts` has to assert the compensation (the `deleteUser` that
 * runs when the membership insert fails), the ban that only `disable` sends and
 * the one `rotatePin` must NOT send, and the email that only the alias edit
 * moves. A client constructed inside the class cannot be replaced without a
 * network call in every one of those tests, so the tests would assert nothing.
 *
 * ─── Y POR QUÉ ES UN `interface` Y NO EL CLIENTE ENTERO ───────────────────────
 *
 * The narrow shape is the point: it makes "what this module can do to Auth" a
 * list that can be read, and a fourth admin call added here fails the typecheck
 * instead of arriving unnoticed.
 */
export const STAFF_AUTH_ADMIN = Symbol('STAFF_AUTH_ADMIN');

/** The three Auth admin calls the nine routes of §8 need, and nothing else. */
export interface StaffAuthAdmin {
  auth: {
    admin: {
      createUser(attributes: {
        email: string;
        password: string;
        email_confirm?: boolean;
        user_metadata?: Record<string, unknown>;
      }): Promise<{
        data: { user: { id: string } | null };
        error: { message?: string } | null;
      }>;
      deleteUser(id: string): Promise<{ error: { message?: string } | null }>;
      updateUserById(
        id: string,
        attributes: {
          password?: string;
          email?: string;
          email_confirm?: boolean;
          ban_duration?: string;
        },
      ): Promise<{ error: { message?: string } | null }>;
    };
  };
}
