export class DeskError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function required<T>(value: T | undefined, message = 'Datensatz nicht gefunden.'): T {
  if (value === undefined) throw new DeskError(404, message);
  return value;
}
