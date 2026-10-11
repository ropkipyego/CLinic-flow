/** Exact database name required before any test truncate. Substring matches are not enough. */
export const TEST_DATABASE_NAME = "clinicflow_test";

export function databaseNameFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const name = decodeURIComponent(parsed.pathname.replace(/^\//, "")).split("/")[0] || "";
    return name || null;
  } catch {
    return null;
  }
}

export function assertIsolatedTestDatabase(url: string): void {
  const name = databaseNameFromUrl(url);
  if (name !== TEST_DATABASE_NAME) {
    throw new Error(
      `Refusing to truncate. DATABASE_URL must use the isolated database "${TEST_DATABASE_NAME}" (got ${name ?? "unparseable URL"}).`,
    );
  }
}
