import "dotenv/config";
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required — set it in your .env file.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/db/schema.ts", "./src/db/recruitment-schema.ts"],
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
