import { pingDatabase } from "@/server/repositories/health.repository";

export type HealthStatus = "ok" | "error";

export interface HealthReport {
  app: HealthStatus;
  database: HealthStatus;
}

export async function checkHealth(): Promise<HealthReport> {
  let database: HealthStatus = "ok";

  try {
    await pingDatabase();
  } catch (error) {
    console.error("[health] database check failed:", error);
    database = "error";
  }

  return { app: "ok", database };
}
