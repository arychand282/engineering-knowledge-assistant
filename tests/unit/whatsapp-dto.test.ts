import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  linkWhatsappNumberSchema,
  normalizePhoneNumber,
  whatsappLinkIdParamSchema,
} from "@/server/dto/whatsapp.dto";

describe("normalizePhoneNumber", () => {
  it("strips +, spaces, and dashes", () => {
    expect(normalizePhoneNumber("+62 812-3456-7890")).toBe("6281234567890");
  });

  it("leaves already-normalized digits untouched", () => {
    expect(normalizePhoneNumber("6281234567890")).toBe("6281234567890");
  });
});

describe("linkWhatsappNumberSchema", () => {
  const userId = randomUUID();

  it("accepts a valid phone number and normalizes it", () => {
    const result = linkWhatsappNumberSchema.safeParse({
      phoneNumber: "+62 812-3456-7890",
      userId,
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.phoneNumber).toBe("6281234567890");
  });

  it("rejects a phone number that's too short after normalization", () => {
    const result = linkWhatsappNumberSchema.safeParse({ phoneNumber: "12345", userId });
    expect(result.success).toBe(false);
  });

  it("rejects a phone number that's too long after normalization", () => {
    const result = linkWhatsappNumberSchema.safeParse({
      phoneNumber: "1234567890123456",
      userId,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-uuid userId", () => {
    const result = linkWhatsappNumberSchema.safeParse({
      phoneNumber: "6281234567890",
      userId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});

describe("whatsappLinkIdParamSchema", () => {
  it("accepts a valid uuid", () => {
    expect(whatsappLinkIdParamSchema.safeParse({ linkId: randomUUID() }).success).toBe(true);
  });

  it("rejects a non-uuid", () => {
    expect(whatsappLinkIdParamSchema.safeParse({ linkId: "not-a-uuid" }).success).toBe(false);
  });
});
