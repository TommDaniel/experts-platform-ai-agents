import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    "DATABASE_URL is not set. Run via `bun run load:clean` from the repo root (.env is auto-loaded).",
  );
  process.exit(1);
}

const sql = postgres(databaseUrl);

try {
  const [{ count }] = await sql`
    SELECT count(*)::int AS count FROM users WHERE email ILIKE '%@coders.local'
  `;
  if (count === 0) {
    console.log("No load-test users found — nothing to clean.");
  } else {
    const deleted = await sql`
      DELETE FROM users
      WHERE email ILIKE '%@coders.local'
      RETURNING id
    `;
    console.log(
      `Deleted ${deleted.length} load-test user(s). Sessions and password reset tokens were removed by cascade.`,
    );
  }
} catch (error) {
  console.error(`Cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
