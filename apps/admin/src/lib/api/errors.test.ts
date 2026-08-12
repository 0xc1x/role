import { describe, expect, test } from "vitest";
import { ApiClientError, throwFromResponse } from "./errors";

describe("ApiClientError", () => {
	test("creates error with single message", () => {
		const err = new ApiClientError({ status: 400, message: "Bad request" });
		expect(err.message).toBe("Bad request");
		expect(err.status).toBe(400);
		expect(err.name).toBe("ApiClientError");
	});

	test("joins array messages", () => {
		const err = new ApiClientError({
			status: 422,
			message: ["name is required", "email is invalid"],
		});
		expect(err.message).toBe("name is required, email is invalid");
	});

	test("stores optional fields", () => {
		const err = new ApiClientError({
			status: 404,
			message: "Not found",
			error: "Not Found",
			path: "/api/v1/categories/123",
		});
		expect(err.error).toBe("Not Found");
		expect(err.path).toBe("/api/v1/categories/123");
	});
});

describe("throwFromResponse", () => {
	async function mockResponse(
		status: number,
		body: unknown,
	): Promise<Response> {
		return {
			status,
			json: () => Promise.resolve(body),
			ok: status >= 200 && status < 300,
		} as Response;
	}

	test("throws ApiClientError with parsed body", async () => {
		const res = await mockResponse(400, {
			statusCode: 400,
			message: "Invalid input",
			error: "Bad Request",
		});
		await expect(throwFromResponse(res)).rejects.toThrow(ApiClientError);
		await expect(throwFromResponse(res)).rejects.toMatchObject({
			status: 400,
			message: "Invalid input",
			error: "Bad Request",
		});
	});

	test("throws generic error when JSON parse fails", async () => {
		const res = {
			status: 500,
			json: () => Promise.reject(new Error("Invalid JSON")),
		} as Response;
		await expect(throwFromResponse(res)).rejects.toThrow(ApiClientError);
		await expect(throwFromResponse(res)).rejects.toMatchObject({
			status: 500,
			message: "Request failed with status 500",
		});
	});

	test("handles array message from Nest", async () => {
		const res = await mockResponse(400, {
			statusCode: 400,
			message: ["name must be a string", "email must be an email"],
			error: "Bad Request",
		});
		await expect(throwFromResponse(res)).rejects.toMatchObject({
			message: "name must be a string, email must be an email",
		});
	});
});
