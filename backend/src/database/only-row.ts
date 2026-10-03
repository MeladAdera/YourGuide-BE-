/**
 * The one row an `INSERT … RETURNING` must produce. PostgreSQL always returns
 * it; the check exists so TypeScript does not treat `rows[0]` as possibly
 * undefined everywhere.
 */
export function onlyRow<T>(rows: T[], statement: string): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`${statement} returned no row`);
  }
  return row;
}
