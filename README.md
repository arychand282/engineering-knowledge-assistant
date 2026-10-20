# Engineering Knowledge Assistant

Aplikasi pencarian dan tanya-jawab dokumen perusahaan yang dapat diverifikasi. Lihat
`PLANNING.md` untuk rencana kerja lengkap, batasan keamanan, dan roadmap tahapan.

> **Status saat ini:** Task 1 (fondasi aplikasi), Task 2 (fondasi database), Task 3
> (document ingestion), dan Task 4 (local embeddings and retrieval) selesai. Belum ada
> chat RAG atau autentikasi sungguhan — tahap tersebut menyusul di task berikutnya.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS
- PostgreSQL + pgvector (via Docker Compose) dengan Drizzle ORM
- `pdfjs-dist` untuk ekstraksi teks PDF per halaman (lokal, tanpa OCR/AI eksternal)
- Ollama (via Docker Compose) untuk embedding lokal — model dev default `nomic-embed-text`
- ESLint + Prettier
- Vitest (unit dan integration test runner)
- Zod (validasi environment dan, nantinya, validasi API)

Sesuai `PLANNING.md`, aplikasi ini **tidak** mengirim dokumen atau prompt ke API AI
eksternal, layanan embedding cloud, atau layanan OCR cloud. Model AI dan embedding berjalan
sepenuhnya lokal lewat Ollama.

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
npm run db:up                   # start PostgreSQL + pgvector via Docker Compose
npm run db:migrate               # apply Drizzle migrations
npm run ai:up                    # start Ollama (local embedding runtime) via Docker Compose
npm run ai:pull-embedding-model   # pull EMBEDDING_MODEL (default: nomic-embed-text, ~274MB)
```

Lihat `.env.example` untuk variabel environment yang tersedia. Pasangan
`EMBEDDING_MODEL`/`EMBEDDING_DIMENSIONS` (`nomic-embed-text` / 768) bersifat PROVISIONAL —
default dev, bukan keputusan model final (butuh benchmark bahasa Indonesia + persetujuan
lisensi, lihat PLANNING.md #3/#18). Mengubah salah satunya setelah ada data membutuhkan
migration baru dan re-embedding seluruh `document_chunks`.

## Menjalankan aplikasi

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000). Cek kesehatan aplikasi + database di
[http://localhost:3000/api/v1/health](http://localhost:3000/api/v1/health), dan
ketersediaan model embedding lokal di
[http://localhost:3000/api/v1/health/ai](http://localhost:3000/api/v1/health/ai).

### Mengunggah dokumen (Task 3)

Belum ada autentikasi (Task 6), jadi setiap request ke `/api/v1/documents` sementara
butuh header `x-user-id` berisi id user yang benar-benar ada di tabel `users`. Buat user
dev sekali saja:

```bash
npm run seed:dev-user   # mencetak user id, idempotent (aman dijalankan berulang)
```

Lalu unggah PDF:

```bash
curl -X POST http://localhost:3000/api/v1/documents \
  -H "x-user-id: <user id dari seed:dev-user>" \
  -F "title=Nama Dokumen" \
  -F "documentNumber=SOP-001" \
  -F "documentType=procedure" \
  -F "revision=0" \
  -F "file=@/path/ke/dokumen.pdf;type=application/pdf"
```

Endpoint lain yang tersedia: `GET /api/v1/documents` (daftar + pagination/filter),
`GET /api/v1/documents/:id` (detail + status ekstraksi per halaman),
`POST /api/v1/documents/:id/reprocess` (ekstraksi ulang dari file yang tersimpan).

Respons upload/reprocess menyertakan `embeddedCount` dan `embeddingSkipped`. Jika Ollama
sedang tidak aktif, upload tetap berhasil (chunk & metadata tersimpan) tapi
`embeddingSkipped: true` dan `embeddedCount: 0` — bukan dianggap gagal total, tapi juga
tidak berpura-pura berhasil melakukan embedding.

### Pencarian dokumen (Task 4)

Belum ada endpoint HTTP untuk pencarian — `searchDocuments` (di
`src/server/usecases/retrieval/search-documents.usecase.ts`) adalah fungsi internal yang
akan dipakai langsung oleh chat usecase di Task 5. Alurnya: filter akses dokumen
berdasarkan `document_access`/role pengguna **sebelum** query apa pun dijalankan, lalu
gabungkan hasil full-text search (PostgreSQL, config `simple`) dan vector search
(pgvector, cosine similarity) dengan Reciprocal Rank Fusion. Lihat
`tests/integration/retrieval.test.ts` untuk contoh pemakaian nyata (termasuk kasus akses
ditolak).

**Model akses saat ini (sementara, menunggu kebijakan RBAC final di Task 6):**
dokumen hanya terlihat jika ada baris `document_access` yang mengizinkan salah satu role
milik pengguna — _default-deny_. Kolom `project_id`/`site_id` pada `document_access` belum
diterapkan sebagai pembatas tambahan (belum ada tabel penugasan user↔proyek/cabang).

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
`document_chunks` punya index GIN (full-text, config `simple`) dan HNSW (`vector_cosine_ops`)
untuk pencarian hybrid di Task 4.

## AI lokal (Ollama)

```bash
npm run ai:up                    # start container Ollama
npm run ai:down                  # stop container (model yang sudah di-pull tetap ada)
npm run ai:pull-embedding-model   # pull model sesuai EMBEDDING_MODEL
```

## Test

```bash
npm test                # unit test (tidak butuh database/Ollama)
npm run test:watch
npm run test:integration  # butuh db:up + db:migrate + ai:up + ai:pull-embedding-model
```

Test unit berada di `tests/unit/` (client Ollama dan merge hasil di-mock, tidak butuh
infrastruktur apa pun). Test integration di `tests/integration/` berjalan terhadap
PostgreSQL **dan** Ollama sungguhan — termasuk `retrieval.test.ts` yang memverifikasi
relevansi hasil pencarian dan bahwa tidak ada kebocoran dokumen lintas role/user. Test
end-to-end (lewat HTTP) akan ditambahkan pada task autentikasi dan evaluasi.

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
- **Upload mengembalikan `401`**: header `x-user-id` belum diisi, atau bukan UUID valid.
  Jalankan `npm run seed:dev-user` dan pakai id yang dicetak.
- **Upload mengembalikan `422 "File tidak dapat dibaca sebagai PDF yang valid"`**: file
  bukan PDF yang bisa di-parse (bukan sekadar cek ekstensi) — PDF.js gagal membuka
  strukturnya. Pastikan file benar-benar PDF teks, bukan hasil scan yang rusak.
- **Upload berhasil tapi `embeddingSkipped: true`**: Ollama tidak terjangkau. Cek
  `npm run ai:up` sudah dijalankan dan `GET /api/v1/health/ai` → `hasEmbeddingModel: true`;
  kalau belum, jalankan `npm run ai:pull-embedding-model`. Upload tidak perlu diulang —
  jalankan `POST /api/v1/documents/:id/reprocess` setelah Ollama aktif untuk mengisi
  embedding yang terlewat.
- **`npm run test:integration` lambat atau gagal di `retrieval.test.ts`**: pastikan
  `npm run ai:up` dan `npm run ai:pull-embedding-model` sudah dijalankan — test ini
  memanggil Ollama sungguhan, bukan mock.

## Keterbatasan saat ini

- Belum ada chat RAG (Task 5) — `searchDocuments` sudah berfungsi tapi belum dipanggil
  dari endpoint chat mana pun.
- Belum ada autentikasi sungguhan (Task 6). Endpoint dokumen memakai header `x-user-id`
  sebagai placeholder sementara (lihat `src/server/controllers/_temporary-actor.ts`) —
  **bukan kontrol keamanan**, siapa pun yang tahu sebuah user id bisa memakainya.
- Belum ada endpoint `PATCH /api/v1/documents/:id` (ubah status/metadata) atau
  `GET /api/v1/documents/:id/pages/:page` (preview satu halaman) — keduanya ada di rencana
  PLANNING.md §12 tapi di luar scope literal Task 3.
- Deteksi halaman hasil scan (`ocr_required`) adalah heuristik berbasis ada/tidaknya
  operator gambar di halaman PDF, bukan analisis sempurna; tidak ada OCR otomatis.
- Chunking memakai perkiraan jumlah kata sebagai proksi token (bukan tokenizer LLM
  sungguhan) dan belum mendeteksi heading/tabel/daftar bernomor secara khusus.
- Model embedding (`nomic-embed-text`, 768 dimensi) adalah default dev, bukan keputusan
  final — belum melalui benchmark bahasa Indonesia atau persetujuan lisensi formal.
- Model akses retrieval baru menerapkan pencocokan role (`document_access.role_id`); kolom
  `project_id`/`site_id` pada `document_access` belum dipakai sebagai pembatas tambahan
  karena belum ada tabel penugasan user↔proyek/cabang (PLANNING.md §18 keputusan 12).
- Tidak ada special-case "admin selalu boleh akses semua dokumen" — kebijakan RBAC final
  (termasuk peran mana yang bypass `document_access`) menunggu Task 6.
- Prototype ini belum siap untuk penggunaan produksi atau operasional kritis.
