import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { badRequest, json } from "../_shared/http.ts";
import { safeErrorFields } from "../_shared/logging.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const expoAccessToken = Deno.env.get("EXPO_ACCESS_TOKEN");
const fcmProjectId = Deno.env.get("FCM_PROJECT_ID");
const fcmServiceAccountRaw = Deno.env.get("FCM_SERVICE_ACCOUNT");
const appUrl = Deno.env.get("APP_URL") ?? "";

const supabase = createClient(supabaseUrl, serviceRoleKey, {
	auth: { persistSession: false, autoRefreshToken: false },
});

type SendRequest = {
	user_ids: string[];
	title: string;
	body: string;
	data?: Record<string, string>;
	type: string;
};

type DeviceToken = {
	id: string;
	token: string;
	platform: "ios" | "android" | "web";
};

type SendResult = { ok: boolean; terminal: boolean };

function absoluteUrl(value: string | undefined, fallback: string): string {
	const raw = value?.trim() || fallback;
	if (raw.startsWith("http")) return raw;
	if (!appUrl) return raw;
	try {
		return new URL(raw, appUrl).href;
	} catch {
		return raw;
	}
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	const copy = new Uint8Array(bytes.byteLength);
	copy.set(bytes);
	return copy.buffer;
}

function base64UrlEncode(bytes: ArrayBuffer): string {
	let binary = "";
	for (const byte of new Uint8Array(bytes)) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getFcmAccessToken(): Promise<string | null> {
	if (!fcmServiceAccountRaw) return null;
	let account: { client_email?: string; private_key?: string; project_id?: string };
	try {
		account = JSON.parse(fcmServiceAccountRaw);
	} catch {
		return null;
	}
	if (!account.client_email || !account.private_key) return null;

	const header = base64UrlEncode(
		asArrayBuffer(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" }))),
	);
	const now = Math.floor(Date.now() / 1000);
	const claim = base64UrlEncode(
		asArrayBuffer(
			new TextEncoder().encode(
				JSON.stringify({
					iss: account.client_email,
					scope: "https://www.googleapis.com/auth/firebase.messaging",
					aud: "https://oauth2.googleapis.com/token",
					iat: now,
					exp: now + 3600,
				}),
			),
		),
	);
	const input = `${header}.${claim}`;
	const pem = account.private_key
		.replace("-----BEGIN PRIVATE KEY-----", "")
		.replace("-----END PRIVATE KEY-----", "")
		.replace(/\s/g, "");
	const keyBytes = Uint8Array.from(atob(pem), (char) => char.charCodeAt(0));
	const privateKey = await crypto.subtle.importKey(
		"pkcs8",
		keyBytes,
		{ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		{ name: "RSASSA-PKCS1-v1_5" },
		privateKey,
		new TextEncoder().encode(input),
	);
	const assertion = `${input}.${base64UrlEncode(signature)}`;
	const response = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
			assertion,
		}),
	});
	if (!response.ok) return null;
	const result = (await response.json()) as { access_token?: string };
	return result.access_token ?? null;
}

async function sendExpo(
	token: string,
	request: SendRequest,
): Promise<SendResult> {
	const response = await fetch("https://exp.host/--/api/v2/push/send", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...(expoAccessToken ? { Authorization: `Bearer ${expoAccessToken}` } : {}),
		},
		body: JSON.stringify({
			to: token,
			title: request.title,
			body: request.body,
			data: { ...(request.data ?? {}), type: request.type },
		}),
	});
	if (!response.ok) return { ok: false, terminal: false };
	const result = (await response.json().catch(() => ({}))) as {
		data?: { status?: string; details?: { error?: string } };
		errors?: Array<{ code?: string }>;
	};
	const errorCode =
		result.data?.details?.error ?? result.errors?.[0]?.code ?? "";
	if (errorCode === "DeviceNotRegistered") return { ok: false, terminal: true };
	return { ok: result.data?.status !== "error", terminal: false };
}

async function sendFcm(
	device: DeviceToken,
	request: SendRequest,
	accessToken: string | null,
	projectId: string,
): Promise<SendResult> {
	if (!accessToken) return { ok: false, terminal: false };
	const response = await fetch(
		`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				message: {
					token: device.token,
					notification: { title: request.title, body: request.body },
					data: { ...(request.data ?? {}), type: request.type },
					webpush: {
						notification: {
							title: request.title,
							body: request.body,
							...(request.data?.icon ? { icon: request.data.icon } : {}),
							...(request.data?.badge ? { badge: request.data.badge } : {}),
							...(request.data?.tag ? { tag: request.data.tag } : {}),
						},
						fcm_options: request.data?.link ? { link: request.data.link } : {},
					},
				},
			}),
		},
	);
	if (response.ok) return { ok: true, terminal: false };
	const body = await response.text();
	const terminal =
		response.status === 404 || body.includes("UNREGISTERED") || body.includes("NOT_FOUND");
	return { ok: false, terminal };
}

Deno.serve(async (request) => {
	if (request.method !== "POST") {
		return json({ error: "Method not allowed" }, { status: 405 });
	}
	if (request.headers.get("Authorization") !== `Bearer ${serviceRoleKey}`) {
		return json({ error: "Unauthorized" }, { status: 401 });
	}

	let body: SendRequest;
	try {
		body = (await request.json()) as SendRequest;
	} catch {
		return badRequest("Invalid JSON body");
	}
	if (!body.user_ids?.length || !body.title || !body.body || !body.type) {
		return badRequest("user_ids, title, body, and type are required");
	}
	const pushRequest: SendRequest = {
		...body,
		data: {
			...(body.data ?? {}),
			link: absoluteUrl(body.data?.link, "/"),
			icon: absoluteUrl(body.data?.icon, "/icons/Icon-192.png"),
			badge: absoluteUrl(body.data?.badge, "/icons/Icon-72.png"),
		},
	};

	const { data: tokens, error } = await supabase
		.from("device_tokens")
		.select("id, token, platform")
		.in("user_id", body.user_ids)
		.eq("is_active", true);
	if (error) {
		console.error(JSON.stringify({ event: "device_tokens_query_failed", ...safeErrorFields(error) }));
		return json({ error: "DB_QUERY_FAILED" }, { status: 500 });
	}
	if (!tokens?.length) return json({ success: true, sent: 0, failed: 0 });

	const accessToken = await getFcmAccessToken();
	const account = fcmServiceAccountRaw
		? (() => {
			try {
				return JSON.parse(fcmServiceAccountRaw) as { project_id?: string };
			} catch {
				return {};
			}
		})()
		: {};
	const projectId = fcmProjectId ?? account.project_id;
	const results = await Promise.all(
		(tokens as DeviceToken[]).map(async (device) => {
			if (device.platform === "web") {
				return projectId
					? sendFcm(device, pushRequest, accessToken, projectId)
					: { ok: false, terminal: false };
			}
			return sendExpo(device.token, pushRequest);
		}),
	);
	const terminalIds = tokens.filter((_, index) => results[index]?.terminal).map((token) => token.id);
	if (terminalIds.length) {
		await supabase
			.from("device_tokens")
			.update({ is_active: false, updated_at: new Date().toISOString() })
			.in("id", terminalIds);
	}

	return json({
		success: true,
		sent: results.filter((result) => result.ok).length,
		failed: results.filter((result) => !result.ok).length,
		deactivated: terminalIds.length,
	});
});
