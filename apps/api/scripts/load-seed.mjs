import postgres from "postgres";
import bcrypt from "bcrypt";

const PASSWORD = process.env.LOAD_SEED_PASSWORD ?? "k6Password!2026";

const SEED_USERS = [
  {
    email: process.env.LOAD_SEED_EMAIL ?? "load.user@coders.local",
    firstName: "Load",
    lastName: "User",
  },
  { email: process.env.LOAD_ME_EMAIL ?? "load.me@coders.local", firstName: "Load", lastName: "Me" },
  {
    email: process.env.LOAD_HELLO_EMAIL ?? "load.hello@coders.local",
    firstName: "Load",
    lastName: "Hello",
  },
  {
    email: process.env.LOAD_LOGOUT_EMAIL ?? "load.logout@coders.local",
    firstName: "Load",
    lastName: "Logout",
  },
];

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    "DATABASE_URL is not set. Run via `bun run load:seed` from the repo root (.env is auto-loaded).",
  );
  process.exit(1);
}

const sql = postgres(databaseUrl);

try {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  let seeded = 0;
  for (const user of SEED_USERS) {
    const inserted = await sql`
      INSERT INTO users (email, password_hash, first_name, last_name, email_verified_at)
      VALUES (${user.email}, ${passwordHash}, ${user.firstName}, ${user.lastName}, now())
      ON CONFLICT (email) DO NOTHING
      RETURNING id
    `;
    if (inserted.length > 0) {
      console.log(`Seeded confirmed user ${user.email} (id=${inserted[0].id})`);
      seeded++;
    } else {
      console.log(`User ${user.email} already exists — nothing to do`);
    }
  }
  if (seeded === 0) {
    console.log("All seed users already exist.");
  }
} catch (error) {
  console.error(`Seed failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
