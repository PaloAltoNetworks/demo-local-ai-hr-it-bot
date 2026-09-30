import Database from "better-sqlite3";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS "user" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "emailVerified" INTEGER NOT NULL DEFAULT 0,
  "image" TEXT,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "session" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "user"("id"),
  "token" TEXT NOT NULL UNIQUE,
  "expiresAt" TEXT NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "account" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "user"("id"),
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "accessTokenExpiresAt" TEXT,
  "refreshTokenExpiresAt" TEXT,
  "scope" TEXT,
  "idToken" TEXT,
  "password" TEXT,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "verification" (
  "id" TEXT PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);
`;

export function migrate(dbPath) {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  db.close();
}
