import { defineConfig } from "vitest/config";

// Unit tests never touch the network or database; these placeholders only
// satisfy env validation for modules that read config at import time.
export default defineConfig({
  test: {
    env: {
      SUPABASE_URL: "http://127.0.0.1:1",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key-000000",
      DATABASE_URL: "postgresql://test",
      LIFTLEDGER_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    },
  },
});
