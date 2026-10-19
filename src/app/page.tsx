export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 px-6 text-center dark:bg-black">
      <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
        Engineering Knowledge Assistant
      </h1>
      <p className="max-w-md text-zinc-600 dark:text-zinc-400">
        Fondasi proyek sedang dibangun. Fitur upload dokumen, pencarian, dan chat RAG akan
        ditambahkan secara bertahap sesuai <code>PLANNING.md</code>.
      </p>
    </main>
  );
}
