import { beforeEach, describe, expect, it, jest } from "bun:test";

const logoutFnMock = jest.fn();

import {
	getToken,
	getTokenExpiresAt,
	setToken,
	setTokenExpiresAt,
} from "@/lib/api/client";
import { logout } from "../api/auth.api";

describe("auth api logout", () => {
	beforeEach(() => {
		window.localStorage.clear();
		setToken("access-token");
		setTokenExpiresAt("2099-01-01T00:00:00.000Z");
		logoutFnMock.mockReset();
	});

	it("clears local auth after server logout succeeds", async () => {
		logoutFnMock.mockResolvedValue(undefined);

		await logout(() => logoutFnMock());

		expect(logoutFnMock).toHaveBeenCalledTimes(1);
		expect(getToken()).toBeNull();
		expect(getTokenExpiresAt()).toBeNull();
	});

	it("clears local auth in finally and propagates revocation failure", async () => {
		const error = new Error("revocation failed");
		logoutFnMock.mockRejectedValue(error);

		await expect(logout(() => logoutFnMock())).rejects.toBe(error);

		expect(getToken()).toBeNull();
		expect(getTokenExpiresAt()).toBeNull();
	});
});
