import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'

const geist = Geist({
  variable: '--font-geist',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Personal Site',
  description: 'Wardrobe, travels, stories.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased bg-white`}>
      <body className="min-h-full flex flex-col bg-white text-black">{children}</body>
    </html>
  )
}
