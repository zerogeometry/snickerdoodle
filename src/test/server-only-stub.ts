// Test stub for the `server-only` package. The real package throws when imported
// outside a React Server Component graph (which is the point — it keeps secret-bearing
// modules off the client bundle). Under vitest there is no `react-server` condition, so
// we alias `server-only` to this no-op so server modules remain unit-testable.
export {};
