# Engineering Knowledge Assistant

Aplikasi pencarian dan tanya-jawab dokumen perusahaan yang dapat diverifikasi. Lihat
`PLANNING.md` untuk rencana kerja lengkap, batasan keamanan, dan roadmap tahapan.

> **Status saat ini:** Task 1 (fondasi aplikasi) dan Task 2 (fondasi database) selesai.
> Belum ada upload dokumen, embedding, retrieval, atau chat RAG — tahap tersebut menyusul
> di task berikutnya.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS
- PostgreSQL + pgvector (via Docker Compose) dengan Drizzle ORM
- ESLint + Prettier
- Vitest (unit dan integration test runner)
- Zod (validasi environment dan, nantinya, validasi API)

Sesuai `PLANNING.md`, aplikasi ini **tidak** mengirim dokumen atau prompt ke API AI
eksternal, layanan embedding cloud, atau layanan OCR cloud. Model AI dan embedding akan
dijalankan secara lokal (Ollama) pada task selanjutnya.

Endpoint API berada di bawah `/api/v1/...` dan mengikuti pemisahan layer
`route.ts` (thin HTTP binding) → `src/server/controllers` → `src/server/usecases` →
`src/server/repositories`. Lihat PLANNING.md bagian 5 untuk detail prinsip ini.

## Prasyarat

- Node.js 20+ (direkomendasikan 22+)
- npm 10+
- Docker + Docker Compose (untuk PostgreSQL + pgvector)

## Setup

```bash
npm install
cp .env.example .env.local
npm run db:up        # start PostgreSQL + pgvector via Docker Compose
npm run db:migrate    # apply Drizzle migrations
```

Lihat `.env.example` untuk variabel environment yang tersedia. `EMBEDDING_DIMENSIONS`
bersifat sementara (768) sampai model embedding lokal dipilih pada Task 4 — mengubahnya
setelah ada data membutuhkan migration baru dan re-embedding seluruh `document_chunks`.

## Menjalankan aplikasi

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000). Cek kesehatan aplikasi + database di
[http://localhost:3000/api/v1/health](http://localhost:3000/api/v1/health).

## Build produksi (smoke test)

```bash
npm run build
npm run start
```

## Lint, format, dan typecheck

```bash
npm run lint          # ESLint
npm run format:check  # Prettier (cek saja)
npm run format        # Prettier (perbaiki otomatis)
npm run typecheck     # next typegen + tsc --noEmit
```

## Database

```bash
npm run db:up         # start container PostgreSQL + pgvector
npm run db:down       # stop & remove container (volume data tetap ada)
npm run db:generate   # generate migration baru dari src/lib/db/schema/*.ts
npm run db:migrate    # terapkan migration yang belum dijalankan
```

Schema didefinisikan per entitas di `src/lib/db/schema/`. Migration SQL tersimpan di
`drizzle/migrations/` dan harus ikut di-commit (bukan hasil generate otomatis saat start).

## Test

```bash
npm test                # unit test (tidak butuh database)
npm run test:watch
npm run test:integration  # butuh `npm run db:up` + `npm run db:migrate` terlebih dahulu
```

Test unit berada di `tests/unit/`, test integration di `tests/integration/` (saat ini
memverifikasi schema, constraint, dan koneksi database sesungguhnya). Test end-to-end akan
ditambahkan pada task autentikasi dan evaluasi.

## Troubleshooting

- **`tsc` gagal dengan error `Cannot find name 'LayoutProps'`**: jalankan `npm run typecheck`
  (bukan `tsc` langsung) — skrip ini menjalankan `next typegen` terlebih dahulu untuk
  membuat tipe route Next.js yang dibutuhkan `layout.tsx`.
- **Port 3000 sudah dipakai**: hentikan proses lain atau jalankan `npm run dev -- -p 3001`.
- **`/api/v1/health` mengembalikan `"database": "error"`**: pastikan `npm run db:up` sudah
  dijalankan dan container sehat (`docker compose ps`), lalu cek `DATABASE_URL` di
  `.env.local` sesuai port Postgres yang dipakai.
- **`npm run test:integration` gagal konek**: pastikan database jalan (`npm run db:up`) dan
  migration sudah diterapkan (`npm run db:migrate`) sebelum menjalankan test ini.
- **`npm audit` melaporkan kerentanan pada `braces` dan `esbuild`**: keduanya advisory
  dev-dependency (dari `eslint-config-next` dan dari CLI `drizzle-kit`), tidak ikut
  production bundle. Versi `braces` yang terpasang sudah versi terbaru (`3.0.3`); drizzle-kit
  stabil terbaru (`0.31.x`) masih membawa dependency `@esbuild-kit/esm-loader` yang usang.
  Tidak ada rilis stabil upstream yang memperbaikinya tanpa downgrade besar saat ini —
  dipantau untuk rilis berikutnya, bukan risiko di runtime production.

## Keterbatasan saat ini

- Belum ada upload dokumen, ekstraksi PDF, embedding, retrieval, atau chat RAG.
- Belum ada autentikasi/otorisasi — endpoint `/api/v1/health` belum memerlukan login.
- Dimensi embedding (`EMBEDDING_DIMENSIONS=768`) masih sementara, menunggu pemilihan model
  pada Task 4.
- Prototype ini belum siap untuk penggunaan produksi atau operasional kritis.
