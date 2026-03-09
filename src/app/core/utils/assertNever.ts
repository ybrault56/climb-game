export function assertNever(value: never, message = "Unexpected variant"): never {
  throw new Error(`${message}: ${String(value)}`);
}
