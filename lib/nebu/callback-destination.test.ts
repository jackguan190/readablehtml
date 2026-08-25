import { describe, expect, it } from "vitest";
import { callbackDestination } from "./callback-destination";

describe("callbackDestination", () => {
  it("keeps malicious callback destinations on Nebu onboarding", () => {
    expect(
      callbackDestination("https://nebu.example", "//attacker.example").href,
    ).toBe("https://nebu.example/onboarding");
    expect(
      callbackDestination("https://nebu.example", "@attacker.example").href,
    ).toBe("https://nebu.example/onboarding");
  });

  it("keeps a valid Nebu assignments destination", () => {
    expect(
      callbackDestination("https://nebu.example", "/assignments").href,
    ).toBe("https://nebu.example/assignments");
  });
});
