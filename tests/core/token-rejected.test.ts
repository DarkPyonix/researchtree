import { describe, expect, it } from "vitest";
import { HttpError, isTokenRejected } from "@researchtree/core";

describe("isTokenRejected", () => {
  it("is true when GitHub says the credentials are no good", () => {
    expect(isTokenRejected(new HttpError(401, "GitHub API 401", { message: "Bad credentials" }))).toBe(true);
    expect(isTokenRejected(new HttpError(401, "GitHub API 401", { message: "Token expired" }))).toBe(true);
    expect(isTokenRejected(new HttpError(401, "GitHub API 401: Bad credentials"))).toBe(true);
  });

  it("is false for a 401 that does not name the token", () => {
    // A captive portal, a proxy error page or a blip must not sign the user out: the token has no expiry.
    expect(isTokenRejected(new HttpError(401, "GitHub API 401"))).toBe(false);
    expect(isTokenRejected(new HttpError(401, "GitHub API 401", { message: "Unauthorized" }))).toBe(false);
    expect(isTokenRejected(new HttpError(401, "GitHub API 401", "<html>Proxy authentication</html>"))).toBe(false);
  });

  it("is false for other failures", () => {
    expect(isTokenRejected(new HttpError(403, "GitHub API 403", { message: "Bad credentials" }))).toBe(false);
    expect(isTokenRejected(new HttpError(404, "GitHub API 404"))).toBe(false);
    expect(isTokenRejected(new Error("offline"))).toBe(false);
    expect(isTokenRejected(null)).toBe(false);
  });
});
