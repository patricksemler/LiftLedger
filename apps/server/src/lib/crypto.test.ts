import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { open, randomToken, seal, sha256 } from "./crypto";

describe("seal/open", () => {
  const key = randomBytes(32);

  it("round-trips", () => {
    const sealed = seal("hevy-key-1234", key);
    expect(sealed.ciphertext).not.toContain("hevy");
    expect(open(sealed, key)).toBe("hevy-key-1234");
  });

  it("uses a fresh iv each time", () => {
    expect(seal("x", key).iv).not.toBe(seal("x", key).iv);
  });

  it("rejects tampering and the wrong key", () => {
    const sealed = seal("secret", key);
    const flipped = Buffer.from(sealed.ciphertext, "base64");
    flipped[0] = (flipped[0] ?? 0) ^ 1;
    expect(() => open({ ...sealed, ciphertext: flipped.toString("base64") }, key)).toThrow();
    expect(() => open(sealed, randomBytes(32))).toThrow();
  });
});

describe("tokens", () => {
  it("hashes deterministically and generates url-safe tokens", () => {
    expect(sha256("a")).toBe(sha256("a"));
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
