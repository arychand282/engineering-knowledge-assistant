import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/health.repository", () => ({
  pingDatabase: vi.fn(),
}));

describe("checkHealth usecase", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("reports database ok when the ping succeeds", async () => {
    const { pingDatabase } = await import("@/server/repositories/health.repository");
    vi.mocked(pingDatabase).mockResolvedValue(true);

    const { checkHealth } = await import("@/server/usecases/health/check-health.usecase");

    await expect(checkHealth()).resolves.toEqual({ app: "ok", database: "ok" });
  });

  it("reports database error without throwing when the ping fails", async () => {
    const { pingDatabase } = await import("@/server/repositories/health.repository");
    vi.mocked(pingDatabase).mockRejectedValue(new Error("connection refused"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { checkHealth } = await import("@/server/usecases/health/check-health.usecase");

    await expect(checkHealth()).resolves.toEqual({ app: "ok", database: "error" });
    errorSpy.mockRestore();
  });
});
