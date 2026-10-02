import { expect, test } from "bun:test";

import { extractOAuthCode, NATIVE_OAUTH_REDIRECT_URL } from "./social-auth";

test("extracts the PKCE code from native and web return URLs", () => {
	expect(extractOAuthCode(`${NATIVE_OAUTH_REDIRECT_URL}?code=abc123`)).toBe(
		"abc123",
	);
	expect(
		extractOAuthCode("https://role.app/callback?code=abc123&state=xyz"),
	).toBe("abc123");
});

test("returns null when the code is missing, empty, or the URL is garbage", () => {
	expect(extractOAuthCode(NATIVE_OAUTH_REDIRECT_URL)).toBeNull();
	expect(extractOAuthCode(`${NATIVE_OAUTH_REDIRECT_URL}?code=`)).toBeNull();
	expect(extractOAuthCode("https://role.app/callback?state=xyz")).toBeNull();
	expect(extractOAuthCode("not a url")).toBeNull();
	expect(extractOAuthCode("")).toBeNull();
});

test("the native redirect URL is a role-scheme URL on the callback path", () => {
	expect(NATIVE_OAUTH_REDIRECT_URL).toBe("role://callback");
});
