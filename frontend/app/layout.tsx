import "../styles/globals.css";
import Link from "next/link";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-neutral-950 text-neutral-100">
        <div className="mx-auto max-w-6xl px-6">
          <header className="flex items-center justify-between py-6">
            <Link href="/models" className="text-lg font-semibold">
              AI Agency
            </Link>
            <nav className="text-sm text-neutral-300">
              <Link href="/models" className="hover:text-white">
                Model Library
              </Link>
            </nav>
          </header>
          {children}
          <footer className="py-10 text-xs text-neutral-500">
            Use only with consenting, authorized assets.
          </footer>
        </div>
      </body>
    </html>
  );
}
