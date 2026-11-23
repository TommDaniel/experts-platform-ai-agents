import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiClient, setStoredToken } from "./api-client";

const jsonHeaders = { "Content-Type": "application/json" };

function fetchMockResolving(value: Response): ReturnType<typeof vi.fn> {
  return vi.fn<(input?: RequestInfo | URL) => Promise<Response>>().mockResolvedValue(value);
}

describe("api-client", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("injects the Authorization Bearer header from the stored token", async () => {
    setStoredToken("secret-token");
    const fetchMock = fetchMockResolving(
      new Response(JSON.stringify({ id: 1 }), { status: 200, headers: jsonHeaders }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await apiClient.get("/auth/me");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/auth/me");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer secret-token");
  });

  it("does not send Authorization when there is no stored token", async () => {
    const fetchMock = fetchMockResolving(
      new Response(JSON.stringify({ id: 1 }), { status: 200, headers: jsonHeaders }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await apiClient.get("/auth/me");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/auth/me");
    expect(new Headers(init.headers).has("Authorization")).toBe(false);
  });

  it("returns parsed JSON on success", async () => {
    const fetchMock = fetchMockResolving(
      new Response(JSON.stringify({ id: 1, email: "ada@example.com" }), {
        status: 200,
        headers: jsonHeaders,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiClient.get("/auth/me")).resolves.toEqual({ id: 1, email: "ada@example.com" });
  });

  it("throws an ApiError with the status on non-2xx responses", async () => {
    const fetchMock = fetchMockResolving(
      new Response(JSON.stringify({ message: "Unauthorized" }), {
        status: 401,
        headers: jsonHeaders,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const error = (await apiClient.get("/auth/me").catch((caught: unknown) => caught)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(401);
    expect(error.payload).toEqual({ message: "Unauthorized" });
  });

  it("propagates network failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<(input?: RequestInfo | URL) => Promise<Response>>()
        .mockRejectedValue(new TypeError("Failed to fetch")),
    );

    await expect(apiClient.get("/auth/me")).rejects.toBeInstanceOf(TypeError);
  });

  it("sends a JSON body on POST", async () => {
    const fetchMock = fetchMockResolving(
      new Response(JSON.stringify({ success: true }), { status: 200, headers: jsonHeaders }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await apiClient.post("/auth/logout", { token: "abc" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/auth/logout");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ token: "abc" }));
  });

  it("returns undefined for 204 responses", async () => {
    const fetchMock = fetchMockResolving(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiClient.delete("/auth/me")).resolves.toBeUndefined();
  });
});
