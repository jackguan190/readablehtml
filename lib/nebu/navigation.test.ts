import { describe, expect, it } from "vitest";
import { postAuthenticationPath, resolveNebuNext } from "./navigation";

describe("resolveNebuNext", () => {
  it("keeps an internal Nebu assignment path", () => {
    expect(resolveNebuNext("/assignments/a1/requirements")).toBe(
      "/assignments/a1/requirements",
    );
  });

  it("defaults missing, external, and legacy destinations to onboarding", () => {
    expect(resolveNebuNext(null)).toBe("/onboarding");
    expect(resolveNebuNext("https://attacker.example")).toBe("/onboarding");
    expect(resolveNebuNext("//attacker.example")).toBe("/onboarding");
    expect(resolveNebuNext("/dashboard")).toBe("/onboarding");
  });
});

describe("postAuthenticationPath", () => {
  it("sends a first-time student to onboarding", () => {
    expect(postAuthenticationPath(0)).toBe("/onboarding");
  });

  it("sends a returning student to assignments", () => {
    expect(postAuthenticationPath(1)).toBe("/assignments");
  });
});
