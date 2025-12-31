import "../styles/globals.css";
import Link from "next/link";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-neutral-950 text-neutral-100">
        <div className="mx-auto max-w-6xl px-6">
          <header className="flex items-center justify-between py-6">
            <Link href="/" className="text-lg font-semibold">
              AI Agency
            </Link>
            <nav className="text-sm text-neutral-300">
              <div className="flex items-center gap-4">
                <Link href="/" className="hover:text-white">
                  Models
                </Link>
                <Link href="/jobs" className="hover:text-white">
                  Jobs
                </Link>
                <Link href="/prompts" className="hover:text-white">
                  Prompts
                </Link>
                <Link href="/projects" className="hover:text-white">
                  Projects
                </Link>
                <Link href="/test" className="hover:text-white">
                  Test
                </Link>
              </div>
            </nav>
          </header>
          {children}
          <footer className="py-10 text-xs text-neutral-500">
          </footer>
        </div>
      </body>
    </html>
  );
}
