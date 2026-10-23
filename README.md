# Engineering Knowledge Assistant

Aplikasi pencarian dan tanya-jawab dokumen perusahaan yang dapat diverifikasi. Lihat
`PLANNING.md` untuk rencana kerja lengkap, batasan keamanan, dan roadmap tahapan.

> **Status saat ini:** Task 1–7 selesai (fondasi aplikasi, database, document ingestion,
> local embeddings & retrieval, chat RAG lokal, autentikasi/otorisasi sungguhan, dan
> evaluasi nyata — lihat `docs/evaluation.md`). Prototype siap didemokan
> (`docs/demo-script.md`) dengan keterbatasan yang didokumentasikan secara transparan
> di bawah — bukan siap produksi.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS
- PostgreSQL + pgvector (via Docker Compose) dengan Drizzle ORM
- `pdfjs-dist` untuk ekstraksi teks PDF per halaman (lokal, tanpa OCR/AI eksternal)
- Ollama (via Docker Compose) untuk embedding lokal — model dev default `nomic-embed-text`
- Ollama untuk chat lokal — model dev default `qwen2.5:3b-instruct`
- ESLint + Prettier
- Vitest (unit dan integration test runner)
- Zod (validasi environment dan, nantinya, validasi API)

Sesuai `PLANNING.md`, aplikasi ini **tidak** mengirim dokumen atau prompt ke API AI
eksternal, layanan embedding cloud, atau layanan OCR cloud — kecuali satu pengecualian
opsional dan eksplisit (`CHAT_PROVIDER`, default tetap `local`) untuk demo di laptop tanpa
GPU; lihat bagian "Chat RAG" di bawah. Embedding dan retrieval **selalu** lokal, tanpa
kecuali, apa pun nilai `CHAT_PROVIDER`.

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
npm run ai:up                    # start Ollama (local embedding + chat runtime) via Docker Compose
npm run ai:pull-embedding-model   # pull EMBEDDING_MODEL (default: nomic-embed-text, ~274MB)
npm run ai:pull-chat-model        # pull CHAT_MODEL (default: qwen2.5:3b-instruct, ~1.9GB)
```

Lihat `.env.example` untuk variabel environment yang tersedia. Pasangan
`EMBEDDING_MODEL`/`EMBEDDING_DIMENSIONS` (`nomic-embed-text` / 768) dan `CHAT_MODEL`
(`qwen2.5:3b-instruct`) bersifat PROVISIONAL — default dev, bukan keputusan model final
(butuh benchmark bahasa Indonesia + persetujuan lisensi, lihat PLANNING.md #3/#18).
Mengubah `EMBEDDING_MODEL`/`EMBEDDING_DIMENSIONS` setelah ada data membutuhkan migration
baru dan re-embedding seluruh `document_chunks`.

## Menjalankan aplikasi

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000). Cek kesehatan aplikasi + database di
[http://localhost:3000/api/v1/health](http://localhost:3000/api/v1/health), dan
ketersediaan model embedding lokal di
[http://localhost:3000/api/v1/health/ai](http://localhost:3000/api/v1/health/ai).

### Antarmuka web (UI minimal)

Selain endpoint API di atas, ada UI minimal untuk memudahkan demo/manual testing tanpa
`curl`:

- `/login` — login dengan email/password sungguhan (lihat "Autentikasi dan otorisasi"
  di bawah untuk cara membuat akun dev).
- `/` — halaman beranda dengan tautan ke Chat dan Dokumen.
- `/documents` — unggah dokumen baru (form, hanya tampil untuk role `admin`/
  `document_controller`) dan lihat daftar dokumen yang bisa diakses.
- `/chat` — sidebar percakapan (buat baru/pilih/hapus) + thread chat, menampilkan status
  jawaban (`answered` / `insufficient_evidence` / `conflict_detected`) dan sumber kutipan
  per pesan.
- `/admin` — hanya untuk role `admin`: kelola role/status aktif tiap pengguna, dan lihat
  audit log terbaru.

Semua halaman di atas (kecuali `/login`) dilindungi oleh pengecekan sesi di client
(redirect ke `/login` kalau belum login) **dan** oleh otorisasi server-side pada setiap
endpoint API yang dipanggilnya — pengecekan di client hanya untuk UX, bukan kontrol
keamanan (sesuai PLANNING.md §10 "Jangan mengandalkan filtering di frontend").

### Autentikasi dan otorisasi (Task 6)

Role dasar (PLANNING.md §10): `admin`, `document_controller`, `engineer`, `viewer`.
Login sungguhan pakai email/password (di-hash dengan `scrypt`, bukan plaintext) dan
session berbasis cookie `HttpOnly` + `SameSite=Lax` (+ `Secure` otomatis saat
`NODE_ENV=production`) yang disimpan di tabel `sessions` — **bukan JWT** supaya logout
dan nonaktifkan akun langsung berlaku tanpa menunggu token kedaluwarsa.

Buat akun dev sekali saja (idempotent, aman dijalankan berulang — juga otomatis mengisi
tabel `roles` kalau masih kosong):

```bash
npm run seed:dev-user
# mencetak: user id, email (dev@example.local), dan password (DevPassword123!)
# role: admin (bisa kelola semua dokumen + /admin)
```

Login lewat `curl` (simpan cookie ke file untuk dipakai permintaan berikutnya):

```bash
curl -c cookies.txt -X POST http://localhost:3000/api/v1/auth/login \
  -H "content-type: application/json" \
  -d '{"email": "dev@example.local", "password": "DevPassword123!"}'
```

Lalu sertakan `-b cookies.txt` di setiap permintaan berikutnya (termasuk upload, chat,
dan endpoint admin). `POST /api/v1/auth/logout` mencabut sesi; `GET /api/v1/auth/me`
mengembalikan identitas + role pengguna yang sedang login.

**Kebijakan RBAC yang difinalisasi di Task 6** (menggantikan catatan "menunggu Task 6" di
versi sebelumnya): `admin` dan `document_controller` bisa melihat/mengelola **semua**
dokumen (list, detail, reprocess) terlepas dari baris `document_access` — mereka yang
mengelola katalog dokumen, jadi tidak masuk akal kalau mereka sendiri tidak bisa melihat
dokumen yang perlu dipublikasikan. `engineer`/`viewer` tetap dibatasi ketat ke
`document_access` (default-deny, seperti Task 4). **Jalur chat/retrieval TIDAK PERNAH
di-bypass untuk role apa pun, termasuk `admin`** — supaya hak kelola dokumen tidak pernah
diam-diam menjadi hak baca konten lewat AI. Dokumen yang tidak bisa diakses pengguna
mengembalikan `404` (bukan `403`) di endpoint detail — mencegah IDOR lewat existence leak.

Endpoint admin (role `admin` saja): `GET /api/v1/admin/users` (daftar pengguna + role),
`PATCH /api/v1/admin/users/:id` (`{"isActive": false}` dan/atau `{"roleNames": [...]}`) —
menonaktifkan akun (`isActive: false`) langsung mencabut **semua** sesi aktif akun
tersebut, ini prosedur "nonaktifkan akun + cabut session" yang diminta PLANNING.md §10.
`GET /api/v1/admin/audit-events` (log login/logout/upload/reprocess/perubahan role
terbaru, dengan pagination).

Rate limiting (in-memory, per-proses — lihat "Keterbatasan" di bawah): login dibatasi per
email (`LOGIN_RATE_LIMIT_MAX_ATTEMPTS`/`_WINDOW_MS`, default 10/15 menit), upload per
pengguna (`UPLOAD_RATE_LIMIT_*`, default 20/jam), chat per pengguna (`CHAT_RATE_LIMIT_*`,
default 30/jam) — respons `429` menyertakan header `Retry-After` (detik).

### Mengunggah dokumen (Task 3)

Setiap request ke `/api/v1/documents` butuh sesi login aktif (lihat di atas), dan role
`admin`/`document_controller` khusus untuk upload/reprocess:

```bash
curl -b cookies.txt -X POST http://localhost:3000/api/v1/documents \
  -F "title=Nama Dokumen" \
  -F "documentNumber=SOP-001" \
  -F "documentType=procedure" \
  -F "revision=0" \
  -F "file=@/path/ke/dokumen.pdf;type=application/pdf"
```

Endpoint lain yang tersedia: `GET /api/v1/documents` (daftar + pagination/filter),
`GET /api/v1/documents/:id` (detail + status ekstraksi per halaman),
`POST /api/v1/documents/:id/reprocess` (ekstraksi ulang dari file yang tersimpan),
`PATCH /api/v1/documents/:id` (ubah status/metadata — role `admin`/`document_controller`).

`PATCH` menerima partial update dalam JSON body — kirim hanya field yang ingin diubah;
field nullable (`effectiveDate`, `supersedesDocumentId`, `projectId`, `siteId`) bisa
dikosongkan dengan mengirim `null` secara eksplisit:

```bash
curl -b cookies.txt -X PATCH http://localhost:3000/api/v1/documents/<id> \
  -H "Content-Type: application/json" \
  -d '{"status": "effective", "effectiveDate": "2026-01-01"}'
```

Setiap perubahan status/metadata tercatat di audit log (`update_document`). Ini murni
operasi CRUD role-gated — bukan alur approval berjenjang (itu tetap di roadmap "Fase
lanjutan", lihat PLANNING.md §15).

Respons upload/reprocess menyertakan `embeddedCount` dan `embeddingSkipped`. Jika Ollama
sedang tidak aktif, upload tetap berhasil (chunk & metadata tersimpan) tapi
`embeddingSkipped: true` dan `embeddedCount: 0` — bukan dianggap gagal total, tapi juga
tidak berpura-pura berhasil melakukan embedding.

### Pencarian dokumen (Task 4)

`searchDocuments` (di `src/server/usecases/retrieval/search-documents.usecase.ts`) belum
punya endpoint HTTP sendiri — dipakai langsung oleh chat usecase (Task 5). Alurnya: filter
akses dokumen berdasarkan `document_access`/role pengguna **sebelum** query apa pun
dijalankan, lalu gabungkan hasil full-text search (PostgreSQL, config `simple`, OR antar
kata — lihat `buildOrTsQuery`) dan vector search (pgvector, cosine similarity) dengan
Reciprocal Rank Fusion. Lihat `tests/integration/retrieval.test.ts` untuk contoh pemakaian
nyata (termasuk kasus akses ditolak).

**Model akses (final, lihat "Autentikasi dan otorisasi" di atas):** untuk chat/retrieval,
dokumen hanya terlihat jika ada baris `document_access` yang mengizinkan salah satu role
milik pengguna — _default-deny_, **tanpa bypass untuk role apa pun**. Kolom
`project_id`/`site_id` pada `document_access` belum diterapkan sebagai pembatas tambahan
(belum ada tabel penugasan user↔proyek/cabang). Belum ada mode "semua user boleh baca
semua dokumen" — lihat PLANNING.md §18 keputusan 4 untuk opsi desainnya jika klien
memintanya nanti.

### Chat RAG (Task 5)

```bash
curl -b cookies.txt -X POST http://localhost:3000/api/v1/chat \
  -H "content-type: application/json" \
  -d '{"message": "Siapa yang wajib memeriksa tekanan boiler setiap hari?"}'
```

`conversationId` pada body bersifat opsional — tanpa itu, percakapan baru otomatis
dibuat. Endpoint lain: `GET /api/v1/conversations` (daftar percakapan milik pengguna),
`GET /api/v1/conversations/:id` (riwayat + sumber tiap jawaban), `DELETE
/api/v1/conversations/:id` (hapus). Ketiganya menolak percakapan milik user lain dengan
`404` (bukan `403`, agar tidak membocorkan keberadaan resource — mencegah IDOR).

Setiap pertanyaan baru dalam percakapan yang sama menyertakan hingga `CHAT_HISTORY_LIMIT`
(default 10) pesan sebelumnya sebagai riwayat ke model, supaya pertanyaan lanjutan
("nomor dokumennya berapa?" tanpa menyebut ulang dokumennya) tetap nyambung dengan
jawaban sebelumnya. **Catatan:** ini hanya memperbaiki ingatan model terhadap
percakapan — pencarian dokumen (`searchDocuments`) tetap hanya memakai teks pertanyaan
terbaru apa adanya, jadi pertanyaan lanjutan yang kata kuncinya tidak tumpang tindih
dengan isi dokumen tetap bisa gagal retrieval meski modelnya sudah "ingat" konteksnya.

Alur `askQuestion` (`src/server/usecases/chat/ask-question.usecase.ts`) mengikuti urutan
di PLANNING.md §8: retrieval dengan filter akses dulu → jika tidak ada bukti sama sekali,
`insufficient_evidence` **tanpa** memanggil model → jika ditemukan dokumen yang saling
mensupersede di antara kandidat (`documents.supersedes_document_id`), `conflict_detected`
**tanpa** memanggil model (ini sinyal pasti dari backend, bukan tebakan model) → baru
kalau lolos keduanya, model lokal dipanggil dengan `format` JSON Schema terstruktur, dan
setiap `source_chunk_ids` yang dikembalikan divalidasi ulang terhadap kandidat retrieval
sesungguhnya — kutipan yang tidak valid diturunkan statusnya ke `insufficient_evidence`,
bukan ditampilkan seadanya. Backend juga menolak `status="conflict_detected"` dari model
jika sumber yang divalidasi hanya berasal dari satu dokumen (konflik butuh ≥2 dokumen
berbeda) — diturunkan ke `answered`/`insufficient_evidence` sesuai ada/tidaknya sumber
valid, bukan dipercaya mentah-mentah dari model.

**Temuan nyata saat pengujian manual (bukan dugaan):** `qwen2.5:3b-instruct` dites 2x
dengan pertanyaan dan konteks yang identik (satu dokumen, satu chunk, jawaban jelas ada).
Isi jawabannya BENAR kedua kali ("Tim Keselamatan"), tapi `status` yang dikembalikan model
berbeda setiap kali: pertama `conflict_detected` (keliru — diturunkan backend ke
`answered`, lihat validasi di atas), kedua `insufficient_evidence` (model sendiri yang
menyatakan ini, langsung dari model, bukan hasil override backend) walau tetap memberi
jawaban singkat yang benar. Backend sengaja tidak menambah heuristik lagi untuk menebak
"status mana yang benar" di luar dua validasi struktural di atas (konflik butuh ≥2
dokumen, sumber harus valid) — ini murni ketidakkonsistenan model kecil ini, dan
mengarah ke sisi yang lebih aman (meragukan diri sendiri), bukan ke sisi yang berbahaya
(percaya diri pada jawaban salah). Ini bukti nyata mengapa PLANNING.md menandai pemilihan
model sebagai keputusan yang masih perlu benchmark SME, bukan sesuatu yang bisa
"diperbaiki" dengan lebih banyak kode di Task 5.

**Latensi chat lokal CPU-only itu nyata dan lambat.** Pada sandbox dev proyek ini, satu
jawaban singkat dari `qwen2.5:3b-instruct` butuh **~12 menit** (943% CPU, tanpa GPU). Model
yang lebih kecil (`qwen2.5:1.5b-instruct`, diuji tapi tidak dipakai) ~40x lebih cepat tapi
salah bahasa (balas Inggris) dan salah kutipan — akurasi sitasi lebih penting daripada
kecepatan untuk aplikasi ini, jadi model kecil ditolak. `OLLAMA_CHAT_TIMEOUT_MS` default
900000 (15 menit) mengakomodasi ini; hardware GPU wajib untuk latensi yang layak produksi
(PLANNING.md §18 keputusan 6).

**Bug nyata yang ditemukan di Task 7 dan diperbaiki:** request chat lokal yang lebih
lambat dari 5 menit SELALU gagal dengan `HeadersTimeoutError`, terlepas dari
`OLLAMA_CHAT_TIMEOUT_MS` — karena request non-streaming tidak mengirim satu byte pun
sampai jawaban selesai dibuat, melebihi `headersTimeout` bawaan Node `undici` (5 menit).
Diperbaiki dengan beralih ke `stream: true` + pembacaan NDJSON progresif
(`src/lib/ai/ollama-client.ts`) — pola yang sama dengan perbaikan Gemini di atas. Lihat
`docs/evaluation.md` untuk rincian lengkap evaluasi Task 7 (metodologi, dataset, dan
temuan lain, termasuk false-negative `insufficient_evidence` yang reproducible pada
konteks yang sebenarnya cukup — keterbatasan model, bukan bug kode).

#### Mode demo tanpa GPU: provider chat eksternal (opsional)

Kalau laptop kamu tidak punya GPU dan ~12 menit per jawaban terlalu lama untuk demo, set
`CHAT_PROVIDER` di `.env.local` ke `gemini`, `openai`, atau `anthropic` (default tetap
`local`). **Ini pengecualian eksplisit terhadap aturan "tanpa AI eksternal" di
`PLANNING.md`** — hanya untuk demo/dev dengan data non-rahasia, dibahas dan disetujui
sebagai permintaan eksplisit (lihat PLANNING.md bagian 8 "Mode Chat Eksternal" untuk
aturan lengkapnya). **Jangan dipakai dengan dokumen perusahaan sungguhan.**

```bash
# .env.local
CHAT_PROVIDER=gemini          # atau: openai, anthropic
GEMINI_API_KEY=isi-key-kamu    # hanya wajib untuk provider yang dipilih
```

| `CHAT_PROVIDER`   | Env var key wajib   | Model default                    | Biaya                         |
| ----------------- | ------------------- | -------------------------------- | ----------------------------- |
| `local` (default) | —                   | `qwen2.5:3b-instruct` via Ollama | Gratis, tapi lambat tanpa GPU |
| `gemini`          | `GEMINI_API_KEY`    | `gemini-flash-lite-latest`       | Ada free tier                 |
| `openai`          | `OPENAI_API_KEY`    | `gpt-4o-mini`                    | Berbayar sejak token pertama  |
| `anthropic`       | `ANTHROPIC_API_KEY` | `claude-haiku-4-5-20251001`      | Berbayar sejak token pertama  |

Aplikasi **menolak start** dengan pesan error jelas kalau `CHAT_PROVIDER` diisi tapi API
key yang sesuai kosong — tidak pernah diam-diam gagal. `GET /api/v1/health/ai`
menampilkan `chatProvider` yang sedang aktif. Saat provider eksternal aktif, server log
mencetak peringatan sekali di awal (nama provider + apa yang dikirim keluar). Embedding
dan retrieval **tidak pernah** memakai provider eksternal ini — hanya langkah generasi
jawaban chat.

**Status verifikasi per provider:**

- **Gemini — diuji end-to-end dengan API key sungguhan, berhasil.** Dua bug nyata
  ditemukan dan diperbaiki selama pengujian ini (bukan dugaan):
  1. Endpoint `generateContent` (non-streaming) **hang tanpa respons sama sekali**
     (timeout, 0 byte diterima) dari jaringan tempat pengujian ini dijalankan — baik lewat
     `curl` maupun `fetch` Node asli. Endpoint `streamGenerateContent` (SSE) untuk model
     yang sama bekerja normal. `gemini-client.ts` sekarang memakai endpoint streaming dan
     menggabungkan kembali potongan teksnya — tidak butuh streaming sungguhan ke
     frontend, hanya butuh endpoint yang responsif.
  2. Mengandalkan instruksi prompt saja (tanpa `responseSchema`) membuat Gemini
     mengarang nama field sendiri (`claim` padahal seharusnya `text`) dan nilai status
     sendiri (`"success"` padahal seharusnya `"answered"`) — isi jawabannya BENAR, tapi
     bentuk JSON-nya gagal validasi Zod setiap kali. Menambahkan `responseSchema`
     (`llmAnswerGeminiSchema` di `answer-schema.ts`, dialek Gemini: tipe huruf besar)
     memperbaikinya sepenuhnya — diverifikasi lagi dengan panggilan nyata.
  3. Model default juga diperbarui: `gemini-1.5-flash` sudah pensiun per Oktober 2026
     (`404 NOT_FOUND`). Diganti ke alias `gemini-flash-lite-latest` (tidak akan basi lagi,
     otomatis mengikuti model flash-lite terbaru Google) — diverifikasi dengan panggilan
     nyata juga.
- **OpenAI, Anthropic — belum diuji dengan API key sungguhan** (tidak ada key tersedia
  untuk keduanya). Hanya unit test mocked (bentuk request, auth header, parsing respons).
  Risiko yang SAMA seperti temuan Gemini di atas (field JSON tidak sesuai schema) mungkin
  juga terjadi di provider ini karena keduanya juga hanya mengandalkan instruksi prompt,
  bukan skema ketat — OpenAI punya mode `response_format: json_schema` (strict) yang lebih
  ketat tapi belum diterapkan karena belum bisa diverifikasi tanpa key sungguhan. Kalau
  kamu test salah satu dengan key asli dan responsnya gagal validasi Zod (bukan error
  koneksi), ini kemungkinan besar penyebabnya — lihat `src/lib/ai/providers/`.

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
npm run ai:pull-chat-model        # pull model sesuai CHAT_MODEL (default qwen2.5:3b-instruct)
```

## Test

```bash
npm test                # unit test (tidak butuh database/Ollama)
npm run test:watch
npm run test:integration  # butuh db:up + db:migrate + ai:up + kedua model di-pull
```

Test unit berada di `tests/unit/` (client Ollama — termasuk `generateChatCompletion` — dan
fungsi retrieval murni di-mock, tidak butuh infrastruktur apa pun). Test integration di
`tests/integration/` berjalan terhadap PostgreSQL **dan** Ollama embedding sungguhan;
hanya pemanggilan model **chat** (`generateChatCompletion`) yang di-mock di
`ask-question.test.ts` — karena satu panggilan chat sungguhan butuh menit, bukan detik
(lihat bagian "Chat RAG" di atas), jadi tidak layak dijalankan berulang di test suite
otomatis. Jalur retrieval, akses, dan deteksi konflik tetap diuji dengan DB sungguhan;
alur "model menjawab sukses" diverifikasi memakai respons model palsu yang realistis, dan
secara manual sekali dengan model sungguhan (lihat laporan task).

`tests/integration/auth.test.ts` menguji login/logout/session (termasuk rate limit dan
pencabutan sesi saat nonaktifkan akun), serta kebijakan RBAC Task 6 (admin/
document_controller bypass `document_access` untuk manajemen dokumen; engineer/viewer
tidak — IDOR dicegah lewat `404`). Semua diuji pada level usecase dengan DB sungguhan; test
end-to-end lewat HTTP (`fetch` ke route yang berjalan) belum ada — divalidasi secara manual
lewat `curl` sebagai gantinya (lihat bagian "Autentikasi dan otorisasi" di atas).

### Evaluasi Task 7 (bukan bagian dari `npm test`)

```bash
npx tsx scripts/eval/run-eval.ts              # jalankan evaluasi, bersihkan data sesudahnya
npx tsx scripts/eval/run-eval.ts --keep-data  # biarkan data eval untuk inspeksi manual
```

Berbeda dari `npm run test:integration`, skrip ini memanggil model chat **sungguhan**
(bukan mock) lewat `CHAT_PROVIDER` apa pun yang aktif di `.env.local` — dengan `local`,
ini bisa butuh puluhan menit (beberapa kasus yang genuinely perlu memanggil model).
Bukan bagian dari test suite otomatis karena alasan yang sama dengan `ask-question.test.ts`
di atas. Hasil tertulis ke `docs/eval/results.md`; ringkasan dan analisis di
`docs/evaluation.md`.

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
- **Upload/chat/admin mengembalikan `401`**: belum login, atau cookie sesi sudah
  kedaluwarsa/dicabut (logout, atau akun dinonaktifkan). Login lagi lewat
  `POST /api/v1/auth/login` (lihat "Autentikasi dan otorisasi") dan pastikan `-b
cookies.txt` disertakan di permintaan berikutnya.
- **Upload/reprocess mengembalikan `403`**: akun yang sedang login tidak punya role
  `admin`/`document_controller`. Cek/ubah role lewat `PATCH /api/v1/admin/users/:id`
  (perlu login sebagai `admin`) atau pakai akun `seed:dev-user` (role `admin` default).
- **Login mengembalikan `429`**: terlalu banyak percobaan login gagal untuk email yang
  sama dalam jendela waktu tertentu (default 10x/15 menit). Tunggu sesuai header
  `Retry-After`, atau ubah `LOGIN_RATE_LIMIT_MAX_ATTEMPTS`/`_WINDOW_MS` di `.env.local`
  untuk testing lokal.
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
- **`POST /api/v1/chat` lambat sekali / tampak macet**: diharapkan. Lihat bagian "Chat RAG"
  di atas — CPU-only inference untuk `qwen2.5:3b-instruct` bisa butuh menit, bukan detik.
  Jalur `insufficient_evidence` dan `conflict_detected` tidak memanggil model sama sekali
  jadi tetap cepat; hanya jalur `answered`/`error` yang menunggu model.
- **`POST /api/v1/chat` mengembalikan `answerStatus: "error"`**: model chat lokal tidak
  terjangkau atau mengembalikan respons yang tidak sesuai schema. Cek `npm run ai:up` dan
  bahwa `CHAT_MODEL` sudah di-pull (`npm run ai:pull-chat-model`); detail error ada di log
  server (`console.error`), tidak dibocorkan ke response. Kalau `CHAT_PROVIDER` diisi
  eksternal, cek API key-nya, bukan Ollama.
- **Aplikasi gagal start dengan error `"..._API_KEY wajib diisi jika CHAT_PROVIDER=..."`**:
  `CHAT_PROVIDER` diisi ke provider eksternal tapi API key-nya kosong di `.env.local`. Isi
  key-nya, atau kembalikan `CHAT_PROVIDER=local` (atau hapus barisnya) kalau tidak sengaja.

## Keterbatasan saat ini

- **MFA belum diimplementasikan** untuk akun `admin` — PLANNING.md §10 menyebutnya
  "jika didukung dan diwajibkan"; tidak ada persyaratan eksplisit untuk prototype ini,
  jadi ditunda sampai ada kebutuhan nyata.
- **Rate limiting bersifat in-memory per-proses** (`src/lib/auth/rate-limit.ts`) — reset
  saat restart dan tidak terkoordinasi lintas instance. Deployment multi-instance
  sungguhan butuh store bersama (mis. Redis), bukan solusi prototype ini.
- **CSRF**: tidak ada token CSRF terpisah. Mitigasi mengandalkan cookie sesi
  `SameSite=Lax` (tidak terkirim pada request cross-site, termasuk upload
  `multipart/form-data`) — cukup untuk prototype, tapi bukan pengganti token CSRF untuk
  kasus yang butuh dukungan browser lama atau subdomain yang tidak dipercaya.
- `PATCH /api/v1/documents/:id` (ubah status/metadata; role `admin`/`document_controller`)
  sudah ada, tapi belum ada UI untuk memanggilnya — pengubahan status/metadata lewat web
  masih manual lewat API. Belum ada endpoint `GET /api/v1/documents/:id/pages/:page`
  (preview satu halaman) — masih di rencana PLANNING.md §12, di luar scope literal Task 3.
- Deteksi halaman hasil scan (`ocr_required`) adalah heuristik berbasis ada/tidaknya
  operator gambar di halaman PDF, bukan analisis sempurna; tidak ada OCR otomatis.
- Chunking memakai perkiraan jumlah kata sebagai proksi token (bukan tokenizer LLM
  sungguhan) dan belum mendeteksi heading/tabel/daftar bernomor secara khusus.
- Model embedding (`nomic-embed-text`, 768 dimensi) dan model chat (`qwen2.5:3b-instruct`)
  adalah default dev, bukan keputusan final — belum melalui benchmark bahasa Indonesia
  atau persetujuan lisensi formal.
- Model akses retrieval baru menerapkan pencocokan role (`document_access.role_id`); kolom
  `project_id`/`site_id` pada `document_access` belum dipakai sebagai pembatas tambahan
  karena belum ada tabel penugasan user↔proyek/cabang (PLANNING.md §18 keputusan 12).
- Deteksi konflik hanya mencakup rantai `supersedes_document_id` yang eksplisit ada di DB,
  atau yang dikenali model dari isi chunk itu sendiri — bukan deteksi kontradiksi semantik
  yang menyeluruh (sesuai PLANNING.md #9: "sistem tidak boleh mengklaim telah mendeteksi
  semua konflik").
- Field `warning` di contoh kontrak PLANNING.md #8 tidak disimpan sebagai kolom terpisah —
  `messages` tidak punya kolom untuk itu, jadi penjelasan konflik/downgrade digabung ke
  dalam teks `answer`/`content` itu sendiri.
- Provider chat eksternal `openai`/`anthropic` belum pernah diuji dengan API key
  sungguhan — hanya mocked unit test (lihat "Status verifikasi per provider" di bagian
  "Chat RAG" di atas; `gemini` SUDAH diuji end-to-end dengan key sungguhan dan berhasil).
  Fitur ini juga merupakan pengecualian eksplisit terhadap batasan "tanpa AI eksternal"
  PLANNING.md — default tetap `local`, dan jangan dipakai dengan dokumen perusahaan
  sungguhan sampai ada persetujuan kebijakan formal.
- **Model `qwen2.5:3b-instruct` bisa salah abstain (false negative) pada konteks yang
  sebenarnya cukup** — ditemukan reproducible (dua kali berturut-turut) lewat evaluasi
  Task 7: pertanyaan dengan jawaban eksplisit di satu dokumen yang diizinkan tetap
  dijawab `insufficient_evidence`. Ini bukan bug kode (backend sudah memvalidasi semua
  yang bisa divalidasi struktural) — ini keterbatasan model 3B parameter ini sendiri,
  dan sengaja TIDAK "diperbaiki" dengan heuristik tambahan (lihat `docs/evaluation.md`
  untuk analisis lengkap serta alasan mengapa menambah heuristik akan jadi tebakan
  tanpa dasar). Mengarah ke sisi yang lebih aman (menolak menjawab) daripada sisi
  berbahaya (jawaban salah dengan percaya diri), tapi tetap berarti akurasi jawaban
  belum bisa diandalkan tanpa benchmark SME sungguhan (PLANNING.md §18 keputusan 7).
- **Ketahanan terhadap prompt injection lewat pertanyaan pengguna belum terbukti kuat**
  — pada satu kasus uji nyata, model tetap menuliskan kata yang diminta penyerang
  ("HACKED") sebagai isi jawaban, meski status akhir dan format JSON tetap benar (lihat
  `docs/evaluation.md` "Catatan penting"). Injection yang diselipkan DI DALAM dokumen
  berhasil ditangkal pada pengujian yang sama. Baru diuji dengan satu pola literal per
  jenis — belum representasi menyeluruh.
- Lihat `docs/evaluation.md` untuk laporan evaluasi Task 7 selengkapnya (metodologi,
  dataset, dan temuan), dan `docs/demo-script.md` untuk panduan demo langkah demi
  langkah.
- Prototype ini belum siap untuk penggunaan produksi atau operasional kritis.
