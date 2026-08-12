import Link from "next/link";

export default function NotFound() {
  return (
    <main className="loading-shell">
      <p className="eyebrow">The path has faded</p>
      <h1>This realm could not be found.</h1>
      <p>Return to the Crown Gate and forge another kingdom.</p>
      <Link className="text-link" href="/">
        Return home
      </Link>
    </main>
  );
}
