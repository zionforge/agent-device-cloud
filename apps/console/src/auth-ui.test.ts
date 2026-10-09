import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest, authQueryError, isApiErrorCode, maskEmail } from "./auth-ui.tsx";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("authentication UI helpers", () => {
  it("masks the mailbox while leaving enough context to identify it", () => {
    expect(maskEmail("a@example.com")).toBe("*@example.com");
    expect(maskEmail("ab@example.com")).toBe("a*@example.com");
    expect(maskEmail("alice@example.com")).toBe("a***e@example.com");
    expect(maskEmail("invalid")).toBe("invalid");
  });

  it("distinguishes verification callbacks from social login errors", () => {
    expect(authQueryError("TOKEN_EXPIRED", true, "login")).toBe(
      "This verification link is invalid or expired. Sign in to request a new one."
    );
    expect(authQueryError("provider_error", false, "login")).toBe(
      "GitHub sign-in could not finish. Verify your GitHub email and try again. Existing email accounts can link GitHub from Account."
    );
    expect(authQueryError("signup_disabled", false, "login")).toBe(
      "New account registration is disabled. Existing users can still sign in."
    );
  });

  it("preserves the server error code for precise recovery actions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { code: "EMAIL_NOT_VERIFIED", message: "Email not verified" },
          { status: 403 }
        )
      )
    );

    const error = await apiRequest("/api/auth/sign-in/email", {
      method: "POST",
      body: "{}"
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      status: 403,
      code: "EMAIL_NOT_VERIFIED",
      rawMessage: "Email not verified"
    });
    expect(isApiErrorCode(error, "EMAIL_NOT_VERIFIED")).toBe(true);
    expect(isApiErrorCode(error, "INVALID_EMAIL_OR_PASSWORD")).toBe(false);
  });
});
