"use client";

export default function GlobalError({ reset }: Readonly<{ reset: () => void }>) {
  return (
    <html lang="en">
      <body>
        <main className="loading-shell">
          <p className="eyebrow">The realm flickered</p>
          <h1>Something disturbed the kingdom.</h1>
          <p>No repository data was changed. You can safely reopen the gate.</p>
          <button className="text-link" type="button" onClick={reset}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
