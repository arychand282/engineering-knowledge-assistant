import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db, pool } from "@/lib/db";
import { projects, sites } from "@/lib/db/schema";
import { listProjects } from "@/server/usecases/catalog/list-projects.usecase";
import { listSites } from "@/server/usecases/catalog/list-sites.usecase";

const createdProjectIds: string[] = [];
const createdSiteIds: string[] = [];

afterAll(async () => {
  await db.delete(projects).where(inArray(projects.id, createdProjectIds));
  await db.delete(sites).where(inArray(sites.id, createdSiteIds));
  await pool.end();
});

describe("listProjects", () => {
  it("returns only active projects, ordered by name", async () => {
    const suffix = randomUUID();
    const [active] = await db
      .insert(projects)
      .values({ code: `P-${suffix}-A`, name: `Zebra Project ${suffix}`, isActive: true })
      .returning();
    const [inactive] = await db
      .insert(projects)
      .values({ code: `P-${suffix}-B`, name: `Inactive Project ${suffix}`, isActive: false })
      .returning();
    createdProjectIds.push(active.id, inactive.id);

    const result = await listProjects();

    expect(result.map((p) => p.id)).toContain(active.id);
    expect(result.map((p) => p.id)).not.toContain(inactive.id);
  });
});

describe("listSites", () => {
  it("returns only active sites", async () => {
    const suffix = randomUUID();
    const [active] = await db
      .insert(sites)
      .values({ code: `S-${suffix}-A`, name: `Site Aktif ${suffix}`, siteType: "plant" })
      .returning();
    const [inactive] = await db
      .insert(sites)
      .values({
        code: `S-${suffix}-B`,
        name: `Site Nonaktif ${suffix}`,
        siteType: "plant",
        isActive: false,
      })
      .returning();
    createdSiteIds.push(active.id, inactive.id);

    const result = await listSites();

    expect(result.map((s) => s.id)).toContain(active.id);
    expect(result.map((s) => s.id)).not.toContain(inactive.id);
  });
});
