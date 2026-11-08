/**
 * Manual trigger for the same reset logic Vercel Cron runs on a schedule (see
 * vercel.json, src/app/api/v1/admin/reset-demo/route.ts). Useful right after sharing
 * the demo link somewhere, without waiting for the next scheduled run.
 */
import { pool } from "@/lib/db";
import { resetDemo } from "@/server/usecases/admin/reset-demo.usecase";

async function main() {
  const result = await resetDemo();
  console.log(result);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
