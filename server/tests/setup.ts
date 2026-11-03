import { execSync } from "child_process";
import path from "path";

// Apply migrations to the isolated test database (file:./test.db, set via
// vitest.config.ts `test.env`) before any test runs.
execSync("npx prisma migrate deploy", {
  cwd: path.resolve(__dirname, ".."),
  env: { ...process.env },
  stdio: "inherit",
});
