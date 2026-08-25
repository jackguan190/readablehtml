import { resolveNebuNext } from "./navigation";

export function callbackDestination(origin: string, rawNext: string | null): URL {
  const next = resolveNebuNext(rawNext);
  return new URL(next, origin);
}
