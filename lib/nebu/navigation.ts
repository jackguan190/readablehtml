const NEBU_PREFIXES = ["/onboarding", "/assignments"] as const;

export function resolveNebuNext(input: string | null): string {
  if (
    input &&
    input.startsWith("/") &&
    !input.startsWith("//") &&
    NEBU_PREFIXES.some(
      (prefix) => input === prefix || input.startsWith(prefix + "/"),
    )
  )
    return input;
  return "/onboarding";
}

export function postAuthenticationPath(
  assignmentCount: number,
): "/onboarding" | "/assignments" {
  return assignmentCount > 0 ? "/assignments" : "/onboarding";
}
