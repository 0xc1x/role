import { create } from "zustand";

import { supabase } from "@/core/supabase/client";

import { parseRole, type UserProfile } from "./domain/user";
import { authRepository, enrichProfile } from "./data/repository";

export type AuthStatus = "loading" | "authenticated" | "guest";

/** Profile derived from the auth session user (metadata only). */
function profileFromUser(user: {
	id: string;
	email?: string | null;
	user_metadata?: Record<string, unknown> | null;
}): UserProfile {
	return {
		id: user.id,
		email: user.email ?? "",
		fullName: (user.user_metadata?.full_name as string | null) ?? null,
		avatarUrl: (user.user_metadata?.avatar_url as string | null) ?? null,
		phone: null,
		city: null,
		role: parseRole(user.user_metadata?.role as string | undefined),
		analyticsConsentGranted:
			user.user_metadata?.analytics_consent_granted === true,
	};
}

interface AuthState {
	status: AuthStatus;
	profile: UserProfile | null;
	/** True while a password-recovery session is active. */
	pendingPasswordRecovery: boolean;
	/** True after the initial session check has completed. */
	initialized: boolean;
	initialize: () => Promise<void>;
	setProfile: (profile: UserProfile | null) => void;
	setPendingPasswordRecovery: (value: boolean) => void;
	clear: () => void;
}

/**
 * Client auth state: session status + profile, mirrored from Supabase
 * auth events. Screens derive role/guards from this store.
 */
export const useAuthStore = create<AuthState>((set) => ({
	status: "loading",
	profile: null,
	pendingPasswordRecovery: false,
	initialized: false,

	initialize: async () => {
		const { data } = await supabase.auth.getSession();
		const session = data.session;
		if (!session?.user) {
			set({ status: "guest", profile: null, initialized: true });
			return;
		}
		const profile = await enrichProfile(profileFromUser(session.user));
		set({ status: "authenticated", profile, initialized: true });
	},

	setProfile: (profile) =>
		set({ profile, status: profile ? "authenticated" : "guest" }),
	setPendingPasswordRecovery: (value) =>
		set({ pendingPasswordRecovery: value }),
clear: () =>
		set({
			status: "guest",
			profile: null,
			pendingPasswordRecovery: false,
			// Keep initialized=true so screens can react to guest state
			initialized: true,
		}),
}));

/**
 * Subscribes to Supabase auth state changes and keeps the store in sync.
 * Call once at app startup (root layout).
 */
export function watchAuthState(): () => void {
	void useAuthStore.getState().initialize();

	const { data } = supabase.auth.onAuthStateChange((event, session) => {
		const store = useAuthStore.getState();
		if (event === "PASSWORD_RECOVERY") {
			store.setPendingPasswordRecovery(true);
		}
		if (event === "SIGNED_OUT" || (!session && event === "INITIAL_SESSION")) {
			store.clear();
		}
		if (session?.user) {
			const userId = session.user.id;
			void enrichProfile(profileFromUser(session.user)).then(
				async (profile) => {
					// El enrich puede resolverse tarde (p. ej. logout + login con
					// otra cuenta): solo aplicar si este usuario sigue siendo la
					// sesión vigente, para no pisar el perfil del usuario nuevo.
					const { data } = await supabase.auth.getSession();
					if (data.session?.user?.id !== userId) return;
					useAuthStore.getState().setProfile(profile);
				},
			);
		}
	});

	return () => data.subscription.unsubscribe();
}