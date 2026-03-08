import { Link, useLocation } from 'react-router-dom'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()

  const navLinks = [
    { to: '/', label: 'Funds' },
    { to: '/holdings', label: 'Holdings' },
    { to: '/insights', label: 'Insights' },
  ]

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="font-display font-bold text-xl text-[var(--accent)] hover:opacity-90">
            WhaleCum
          </Link>
          <nav className="flex gap-6">
            {navLinks.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                className={`text-sm font-medium transition ${
                  location.pathname === to ||
                  (to === '/' && location.pathname.startsWith('/funds')) ||
                  (to !== '/' && location.pathname.startsWith(to))
                    ? 'text-[var(--accent)]'
                    : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  )
}
