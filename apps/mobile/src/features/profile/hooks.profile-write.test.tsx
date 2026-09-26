import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createElement } from "react";
// @ts-expect-error react-dom is installed without declarations in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { UserProfile } from "@/src/features/auth/domain/user";

// Una escritura de perfil confirmada por el servidor no puede dejar la UI
// mostrando el nombre/teléfono anteriores: si la relectura de respaldo falla,
// el store publicaba el valor viejo bajo un toast de "guardado".

const STALE: UserProfile = {
	id: "user-1",
	email: "antes@role.app",
	fullName: "Nombre Viejo",
	avatarUrl: null,
	phone: "0999999999",
	city: "Quito",
	role: "user",
	analyticsConsentGranted: true,
};

let storeProfile: UserProfile | null = STALE;
const published: UserProfile[] = [];

const updateProfile = mock(async () => undefined);
const updateEmail = mock(async () => undefined);
let fetchProfileImpl: (userId: string) => Promise<UserProfile | null> =
	async () => null;

mock.module("@/src/features/profile/data/repository", () => ({
	profileRepository: { updateProfile },
}));

mock.module("@/src/features/auth/data/repository", () => ({
	authRepository: {
		fetchProfile: (userId: string) => fetchProfileImpl(userId),
		updateEmail,
	},
}));

mock.module("@/src/features/auth/store", () => ({
	useAuthStore: {
		getState: () => ({
			get profile() {
				return storeProfile;
			},
			setProfile: (profile: UserProfile | null) => {
				storeProfile = profile;
				if (profile) published.push(profile);
			},
		}),
	},
}));

const { useSaveProfileWithEmail, useUpdateProfile } = await import("./hooks");

/** Monta el hook en un QueryClient real y dispara la mutación. */
async function save<TVariables>(
	useHook: () => { mutateAsync: (variables: TVariables) => Promise<unknown> },
	variables: TVariables,
): Promise<UserProfile | null> {
	const client = new QueryClient({
		defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
	});
	const holder: {
		mutate: ((variables: TVariables) => Promise<unknown>) | null;
	} = { mutate: null };
	function Probe() {
		holder.mutate = useHook().mutateAsync;
		return null;
	}
	renderToStaticMarkup(
		createElement(QueryClientProvider, { client }, createElement(Probe)),
	);
	await holder.mutate?.(variables);
	return storeProfile;
}

const PATCH = { full_name: "Nombre Nuevo", phone: null, city: "Guayaquil" };
const FORM = {
	fullName: "Nombre Nuevo",
	email: "antes@role.app",
	phone: null,
	city: "Guayaquil",
};

describe("actualización de perfil", () => {
	beforeEach(() => {
		storeProfile = STALE;
		published.length = 0;
		updateProfile.mockClear();
		updateEmail.mockClear();
		// Por defecto la relectura falla: es el caso que dejaba la UI vieja.
		fetchProfileImpl = async () => {
			throw new Error("sin red");
		};
	});

	test("useUpdateProfile no deja el store viejo si la relectura falla", async () => {
		const result = await save(() => useUpdateProfile("user-1"), PATCH);

		expect(updateProfile).toHaveBeenCalledWith("user-1", PATCH);
		expect(result?.fullName).toBe("Nombre Nuevo");
		expect(result?.phone).toBeNull();
		expect(result?.city).toBe("Guayaquil");
		// Campos no tocados por el patch sobreviven.
		expect(result?.email).toBe(STALE.email);
		expect(result?.avatarUrl).toBe(STALE.avatarUrl);
	});

	test("useSaveProfileWithEmail no deja el store viejo si la relectura falla", async () => {
		const result = await save(
			() => useSaveProfileWithEmail("user-1", "antes@role.app"),
			FORM,
		);

		expect(result?.fullName).toBe("Nombre Nuevo");
		expect(result?.city).toBe("Guayaquil");
		expect(result?.phone).toBeNull();
	});

	test("la relectura exitosa sigue siendo la fuente del store", async () => {
		const fresh: UserProfile = { ...STALE, fullName: "Nombre Del Servidor" };
		fetchProfileImpl = async () => fresh;

		const result = await save(() => useUpdateProfile("user-1"), PATCH);

		expect(result?.fullName).toBe("Nombre Del Servidor");
		expect(published).toHaveLength(1);
	});

	test("no pisa el perfil si la sesión cambió mientras se re-leía", async () => {
		storeProfile = { ...STALE, id: "user-2" };

		await save(() => useUpdateProfile("user-1"), PATCH);

		expect(published).toHaveLength(0);
		expect(storeProfile?.id).toBe("user-2");
	});
});
