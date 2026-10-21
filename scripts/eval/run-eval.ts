/**
 * Task 7 evaluation runner (PLANNING.md §19 "Buat test dataset dummy. Uji kutipan,
 * halaman, abstention, konflik, dan prompt injection."). Not a vitest suite — this
 * exercises the real chat pipeline end-to-end (real Postgres, real Ollama embeddings,
 * and whatever CHAT_PROVIDER is configured for generation) and prints a pass/fail
 * report plus writes it to docs/eval/results.md.
 *
 * Usage: npx tsx scripts/eval/run-eval.ts [--keep-data]
 * --keep-data skips cleanup at the end (default: cleans up everything it created).
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "@/lib/db";
import { documentAccess, documents, roles, userRoles, users } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { deleteStoredFile } from "@/lib/storage/local-storage";
import { askQuestion } from "@/server/usecases/chat/ask-question.usecase";
import { uploadDocument } from "@/server/usecases/documents/upload-document.usecase";
import { buildPdf } from "./build-pdf";
import {
  boilerRev0,
  boilerRev1,
  evalCases,
  injectionDocument,
  officeSupplies,
  type EvalDocumentSpec,
} from "./dataset";

const keepData = process.argv.includes("--keep-data");

interface CaseResult {
  id: string;
  description: string;
  pass: boolean;
  expectedStatus: string;
  actualStatus: string | null;
  expectedAnswerContains?: string;
  answerContainsOk: boolean;
  expectedSourceDocumentNumber?: string;
  sourceOk: boolean;
  answer: string;
  sourceDocumentNumbers: string[];
  notes: string;
  error?: string;
}

async function uploadEvalDocument(spec: EvalDocumentSpec, uploadedBy: string) {
  const pdf = buildPdf(spec.pages);
  const result = await uploadDocument({
    file: { buffer: pdf, mimeType: "application/pdf", originalFilename: `${spec.key}.pdf` },
    metadata: {
      title: spec.title,
      documentNumber: spec.documentNumber,
      documentType: spec.documentType,
      revision: spec.revision,
    },
    uploadedBy,
  });
  if (result.embeddingSkipped) {
    throw new Error(
      `Embedding dilewati untuk ${spec.key} — Ollama tidak terjangkau. Jalankan 'npm run ai:up' dan 'npm run ai:pull-embedding-model' dulu.`,
    );
  }
  return result.document;
}

async function createEvalRole(name: string): Promise<string> {
  const [row] = await db.insert(roles).values({ name }).returning();
  return row.id;
}

async function createEvalUser(email: string, roleIds: string[]): Promise<string> {
  const [user] = await db.insert(users).values({ email, name: email }).returning();
  if (roleIds.length > 0) {
    await db.insert(userRoles).values(roleIds.map((roleId) => ({ userId: user.id, roleId })));
  }
  return user.id;
}

async function main() {
  console.log(`CHAT_PROVIDER aktif: ${env.CHAT_PROVIDER}`);
  console.log(
    env.CHAT_PROVIDER === "local"
      ? "Peringatan: provider lokal bisa butuh ~12 menit per jawaban 'answered' (lihat README). Ini akan lambat."
      : `Memakai provider eksternal (${env.CHAT_PROVIDER}) — lebih cepat, tapi hasil 'answered' di bawah mencerminkan perilaku provider ini, bukan model lokal.`,
  );

  const runPrefix = `eval-${randomUUID().slice(0, 8)}`;
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdDocumentIds: string[] = [];
  const createdStorageKeys: string[] = [];

  // Kept out of createdUserIds deliberately: documents.uploadedBy is ON DELETE RESTRICT,
  // so this user must be deleted AFTER the documents it uploaded, not alongside the
  // asker users (see cleanup order below).
  const uploaderId = await createEvalUser(`${runPrefix}-uploader@example.test`, []);

  console.log("Mengunggah dokumen eval...");
  const docRev0 = await uploadEvalDocument(boilerRev0, uploaderId);
  const docRev1 = await uploadEvalDocument(boilerRev1, uploaderId);
  const docOffice = await uploadEvalDocument(officeSupplies, uploaderId);
  const docInjection = await uploadEvalDocument(injectionDocument, uploaderId);
  createdDocumentIds.push(docRev0.id, docRev1.id, docOffice.id, docInjection.id);
  createdStorageKeys.push(
    docRev0.storageKey,
    docRev1.storageKey,
    docOffice.storageKey,
    docInjection.storageKey,
  );

  // No PATCH /api/v1/documents/:id endpoint exists yet (known gap, see README) — set the
  // supersedes link directly so the deterministic conflict check has something to find.
  await db
    .update(documents)
    .set({ supersedesDocumentId: docRev0.id })
    .where(eq(documents.id, docRev1.id));

  console.log("Menyiapkan role dan grant akses eval...");
  const roleRev1Only = await createEvalRole(`${runPrefix}-rev1-only`);
  const roleBothRevisions = await createEvalRole(`${runPrefix}-both-revisions`);
  const roleOfficeOnly = await createEvalRole(`${runPrefix}-office-only`);
  const roleInjectionOnly = await createEvalRole(`${runPrefix}-injection-only`);
  createdRoleIds.push(roleRev1Only, roleBothRevisions, roleOfficeOnly, roleInjectionOnly);

  await db.insert(documentAccess).values([
    { documentId: docRev1.id, roleId: roleRev1Only },
    { documentId: docRev0.id, roleId: roleBothRevisions },
    { documentId: docRev1.id, roleId: roleBothRevisions },
    { documentId: docOffice.id, roleId: roleOfficeOnly },
    { documentId: docInjection.id, roleId: roleInjectionOnly },
  ]);

  const userIdByKey: Record<string, string> = {
    "rev1-only": await createEvalUser(`${runPrefix}-rev1-only@example.test`, [roleRev1Only]),
    "both-revisions": await createEvalUser(`${runPrefix}-both-revisions@example.test`, [
      roleBothRevisions,
    ]),
    "no-access": await createEvalUser(`${runPrefix}-no-access@example.test`, []),
    "office-only": await createEvalUser(`${runPrefix}-office-only@example.test`, [roleOfficeOnly]),
    "injection-only": await createEvalUser(`${runPrefix}-injection-only@example.test`, [
      roleInjectionOnly,
    ]),
  };
  createdUserIds.push(...Object.values(userIdByKey));

  console.log(`Menjalankan ${evalCases.length} kasus uji...\n`);
  const results: CaseResult[] = [];

  for (const testCase of evalCases) {
    const userId = userIdByKey[testCase.userKey];
    if (!userId) {
      throw new Error(`Unknown userKey di dataset: ${testCase.userKey}`);
    }

    process.stdout.write(`[${testCase.id}] ${testCase.description} ... `);
    try {
      const result = await askQuestion({ message: testCase.question, userId });
      const actualStatus = result.message.answerStatus;
      const answer = result.message.content;
      const sourceDocumentNumbers = [...new Set(result.sources.map((s) => s.documentNumber))];

      const statusOk = actualStatus === testCase.expectedStatus;
      const answerContainsOk = testCase.expectedAnswerContains
        ? answer.toLowerCase().includes(testCase.expectedAnswerContains.toLowerCase())
        : true;
      const sourceOk = testCase.expectedSourceDocumentNumber
        ? sourceDocumentNumbers.includes(testCase.expectedSourceDocumentNumber)
        : true;

      const pass = statusOk && answerContainsOk && sourceOk;
      results.push({
        id: testCase.id,
        description: testCase.description,
        pass,
        expectedStatus: testCase.expectedStatus,
        actualStatus,
        expectedAnswerContains: testCase.expectedAnswerContains,
        answerContainsOk,
        expectedSourceDocumentNumber: testCase.expectedSourceDocumentNumber,
        sourceOk,
        answer,
        sourceDocumentNumbers,
        notes: testCase.notes,
      });
      console.log(pass ? "PASS" : "FAIL");
    } catch (error) {
      results.push({
        id: testCase.id,
        description: testCase.description,
        pass: false,
        expectedStatus: testCase.expectedStatus,
        actualStatus: null,
        answerContainsOk: false,
        sourceOk: false,
        answer: "",
        sourceDocumentNumbers: [],
        notes: testCase.notes,
        error: error instanceof Error ? error.message : String(error),
      });
      console.log(`ERROR (${error instanceof Error ? error.message : error})`);
    }
  }

  const passCount = results.filter((r) => r.pass).length;
  console.log(`\n${passCount}/${results.length} kasus lolos.\n`);

  writeReport(results);

  if (!keepData) {
    console.log("Membersihkan data eval...");
    // Order matters: asker users first (cascades their conversations/messages/
    // message_sources, which reference documents with ON DELETE RESTRICT) — only then
    // can documents be deleted, and only then can the uploader (documents.uploadedBy,
    // also RESTRICT) be deleted.
    await db.delete(users).where(inArray(users.id, createdUserIds));
    await db.delete(documents).where(inArray(documents.id, createdDocumentIds));
    await db.delete(users).where(eq(users.id, uploaderId));
    await db.delete(roles).where(inArray(roles.id, createdRoleIds));
    for (const storageKey of createdStorageKeys) {
      await deleteStoredFile(storageKey);
    }
    console.log("Selesai membersihkan.");
  } else {
    console.log("--keep-data diset: data eval dibiarkan di database untuk inspeksi manual.");
  }
}

function writeReport(results: CaseResult[]) {
  const outDir = path.join(process.cwd(), "docs", "eval");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "results.md");

  const passCount = results.filter((r) => r.pass).length;
  const lines: string[] = [
    "# Hasil Evaluasi Task 7",
    "",
    `Dijalankan: ${new Date().toISOString()} | CHAT_PROVIDER: ${env.CHAT_PROVIDER} | Lolos: ${passCount}/${results.length}`,
    "",
    "Dataset dan skenario: lihat `scripts/eval/dataset.ts`. Hasil ini dari pemanggilan nyata ke `askQuestion`, bukan simulasi.",
    "",
  ];

  for (const r of results) {
    lines.push(`## ${r.pass ? "✅" : "❌"} ${r.id}`);
    lines.push("");
    lines.push(r.notes);
    lines.push("");
    lines.push(
      `- Status: expected \`${r.expectedStatus}\`, got \`${r.actualStatus ?? "(error)"}\``,
    );
    if (r.expectedAnswerContains) {
      lines.push(
        `- Jawaban mengandung "${r.expectedAnswerContains}": ${r.answerContainsOk ? "ya" : "TIDAK"}`,
      );
    }
    if (r.expectedSourceDocumentNumber) {
      lines.push(
        `- Sumber mencakup \`${r.expectedSourceDocumentNumber}\`: ${r.sourceOk ? "ya" : "TIDAK"} (sumber nyata: ${r.sourceDocumentNumbers.join(", ") || "-"})`,
      );
    }
    if (r.error) {
      lines.push(`- Error: ${r.error}`);
    } else {
      lines.push(`- Jawaban nyata: "${r.answer}"`);
    }
    lines.push("");
  }

  writeFileSync(outPath, lines.join("\n"));
  console.log(`Laporan ditulis ke ${outPath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
