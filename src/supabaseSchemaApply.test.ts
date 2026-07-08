import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildSupabaseSchemaApplyArtifact,
  buildSupabaseSchemaApplyPlan,
  maskDatabaseUrl,
  resolveSupabaseDatabaseUrl,
  validateSupabaseSchemaContract,
} from "./supabaseSchemaApply";

describe("Supabase schema apply plan", () => {
  it("prefers explicit Supabase database URL env vars", () => {
    expect(
      resolveSupabaseDatabaseUrl({
        DATABASE_URL: "postgresql://fallback",
        SUPABASE_DATABASE_URL: "postgresql://project",
        SUPABASE_DB_URL: "postgresql://preferred",
      }),
    ).toBe("postgresql://preferred");
  });

  it("masks database passwords before printing commands", () => {
    expect(maskDatabaseUrl("postgresql://postgres:secret@db.project.supabase.co:5432/postgres")).toBe(
      "postgresql://postgres:***@db.project.supabase.co:5432/postgres",
    );
    expect(maskDatabaseUrl("postgres://user:secret@example.com/db")).toBe("postgres://***:***@example.com/db");
  });

  it("builds a psql dry-run plan for the checked-in schema", () => {
    const schemaSql = readFileSync("supabase.schema.sql", "utf8");
    const plan = buildSupabaseSchemaApplyPlan(
      {
        SUPABASE_DB_URL: "postgresql://postgres:secret@db.project.supabase.co:5432/postgres",
      },
      { dryRun: true, schemaPath: "supabase.schema.sql", schemaSql },
    );

    expect(plan.ready).toBe(true);
    expect(plan.schemaContract).toMatchObject({
      ready: true,
      passed: 9,
      total: 9,
      missing: [],
    });
    expect(plan.dryRun).toBe(true);
    expect(plan.command).toBe("psql");
    expect(plan.args).toEqual([
      "--set",
      "ON_ERROR_STOP=1",
      "--file",
      "supabase.schema.sql",
      "postgresql://postgres:secret@db.project.supabase.co:5432/postgres",
    ]);
    expect(plan.maskedDatabaseUrl).toContain(":***@");
    expect(plan.action).toContain("doctor:supabase");
  });

  it("validates the checked-in production schema contract", () => {
    const contract = validateSupabaseSchemaContract(readFileSync("supabase.schema.sql", "utf8"));

    expect(contract.ready).toBe(true);
    expect(contract.checks.map((check) => check.id)).toEqual([
      "required-tables",
      "share-artifact-columns",
      "leaderboard-columns",
      "backend-health-columns",
      "backend-health-leaderboard-columns",
      "share-storage-contract",
      "storage-owner-write-policies",
      "auth-uid-write-policies",
      "public-read-grants",
    ]);
  });

  it("blocks schema apply when the SQL contract is missing production share columns", () => {
    const schemaSql = readFileSync("supabase.schema.sql", "utf8").replace("image_byte_length integer,\n", "");
    const plan = buildSupabaseSchemaApplyPlan(
      {
        SUPABASE_DB_URL: "postgresql://postgres:secret@db.project.supabase.co:5432/postgres",
      },
      { dryRun: true, schemaSql },
    );

    expect(plan.ready).toBe(false);
    expect(plan.missing).toContain("schema:share-artifact-columns");
    expect(plan.schemaContract?.checks.find((check) => check.id === "share-artifact-columns")).toMatchObject({
      passed: false,
      detail: expect.stringContaining("image_byte_length"),
    });
    expect(plan.action).toContain("schema contract");
  });

  it("blocks schema apply when leaderboard identity columns are not part of the health contract", () => {
    const schemaSql = readFileSync("supabase.schema.sql", "utf8")
      .replace("    ('kickoff_leaderboard', 'display_name'),\n", "")
      .replace("    ('kickoff_leaderboard', 'location'),\n", "");
    const contract = validateSupabaseSchemaContract(schemaSql);

    expect(contract.ready).toBe(false);
    expect(contract.missing).toContain("backend-health-leaderboard-columns");
    expect(contract.checks.find((check) => check.id === "backend-health-leaderboard-columns")).toMatchObject({
      passed: false,
      detail: expect.stringContaining("display_name"),
    });
  });

  it("blocks schema apply when write policies accept email fallback identity", () => {
    const schemaSql = readFileSync("supabase.schema.sql", "utf8").replace(
      "using (auth.uid()::text = user_id)\n  with check (auth.uid()::text = user_id);",
      "using (auth.uid()::text = user_id or auth.jwt() ->> 'email' = email)\n  with check (auth.uid()::text = user_id or auth.jwt() ->> 'email' = email);",
    );
    const contract = validateSupabaseSchemaContract(schemaSql);

    expect(contract.ready).toBe(false);
    expect(contract.missing).toContain("auth-uid-write-policies");
    expect(contract.checks.find((check) => check.id === "auth-uid-write-policies")).toMatchObject({
      passed: false,
      detail: "write policies must not accept email/JWT fallback identity",
    });
  });

  it("blocks schema apply when share-card storage writes are not scoped to the auth user folder", () => {
    const schemaSql = readFileSync("supabase.schema.sql", "utf8").replace(
      /    and \(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text\n/g,
      "",
    );
    const contract = validateSupabaseSchemaContract(schemaSql);

    expect(contract.ready).toBe(false);
    expect(contract.missing).toContain("storage-owner-write-policies");
    expect(contract.checks.find((check) => check.id === "storage-owner-write-policies")).toMatchObject({
      passed: false,
      detail: "Storage upload/update policies must bind object paths to auth.uid() user folders",
    });
  });

  it("reports the missing database URL as a real production blocker", () => {
    const plan = buildSupabaseSchemaApplyPlan({}, { dryRun: true });

    expect(plan.ready).toBe(false);
    expect(plan.missing).toEqual(["SUPABASE_DB_URL"]);
    expect(plan.action).toContain("Supabase project Postgres connection string");
  });

  it("builds a reusable schema apply artifact only after a non-dry-run apply succeeds", () => {
    const schemaSql = readFileSync("supabase.schema.sql", "utf8");
    const plan = buildSupabaseSchemaApplyPlan(
      {
        SUPABASE_DB_URL: "postgresql://postgres:secret@db.project.supabase.co:5432/postgres",
      },
      { dryRun: false, schemaSql },
    );

    const artifact = buildSupabaseSchemaApplyArtifact(plan, {
      envFiles: [".env.production.local"],
      schemaReadable: true,
      psqlAvailable: true,
      applied: true,
      executeStatus: 0,
      generatedAt: "2026-07-04T12:00:00.000Z",
    });

    expect(artifact.ready).toBe(true);
    expect(artifact.acceptance).toMatchObject({
      schemaReadable: true,
      contractReady: true,
      psqlAvailable: true,
      applied: true,
      dryRun: false,
    });
    expect(artifact.acceptance.outputEnvKeys).toContain("kickoff_backend_health");
  });

  it("keeps dry-run schema artifacts out of production readiness", () => {
    const schemaSql = readFileSync("supabase.schema.sql", "utf8");
    const plan = buildSupabaseSchemaApplyPlan(
      {
        SUPABASE_DB_URL: "postgresql://postgres:secret@db.project.supabase.co:5432/postgres",
      },
      { dryRun: true, schemaSql },
    );

    const artifact = buildSupabaseSchemaApplyArtifact(plan, {
      schemaReadable: true,
      psqlAvailable: true,
      applied: false,
      generatedAt: "2026-07-04T12:00:00.000Z",
    });

    expect(artifact.ready).toBe(false);
    expect(artifact.acceptance.dryRun).toBe(true);
    expect(artifact.acceptance.applied).toBe(false);
  });
});
