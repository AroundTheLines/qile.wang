import Link from 'next/link'

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-white flex flex-col items-center justify-center gap-8">
      <nav className="flex flex-col items-center gap-6">
        <Link
          href="/wardrobe"
          className="text-2xl tracking-widest uppercase font-light text-black hover:opacity-50 transition-opacity"
        >
          Wardrobe
        </Link>
        <span className="text-xs tracking-widest text-gray-300 uppercase">or</span>
        <Link
          href="/globe"
          className="text-2xl tracking-widest uppercase font-light text-black hover:opacity-50 transition-opacity"
        >
          Globe
        </Link>
        <span className="text-xs tracking-widest text-gray-300 uppercase">or</span>
        <Link
          href="/feed"
          className="text-2xl tracking-widest uppercase font-light text-black hover:opacity-50 transition-opacity"
        >
          Feed
        </Link>
      </nav>
    </main>
  )
}
