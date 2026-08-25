export function errorStack(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}

export function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = error.code;
  return typeof code === 'string' ? code : undefined;
}

export function errorProperty(error: unknown, property: string): string | undefined {
  if (!isRecord(error)) return undefined;
  const value = error[property];
  return typeof value === 'string' ? value : undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
