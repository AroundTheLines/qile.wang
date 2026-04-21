import Timeline from '@/components/globe/Timeline'
import { MOCK_TRIPS } from '@/lib/timelineMocks'

export const metadata = { title: 'Timeline dev' }

export default function TimelineDevPage() {
  return (
    <main className="min-h-screen bg-white dark:bg-black flex flex-col">
      <div className="flex-1" />
      <Timeline trips={MOCK_TRIPS} now="2024-04-15" />
      <div className="flex-1" />
    </main>
  )
}
