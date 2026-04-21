import type { TripRange } from './timelineCompression'

export const MOCK_TRIPS: (TripRange & { title: string })[] = [
  { id: '1', title: "Morocco '18", startDate: '2018-05-10', endDate: '2018-05-17' },
  { id: '2', title: 'Tokyo 2019', startDate: '2019-04-01', endDate: '2019-04-10' },
  { id: '3', title: "Japan Spring '22", startDate: '2022-03-05', endDate: '2022-03-18' },
  { id: '4', title: "Berlin '22", startDate: '2022-09-01', endDate: '2022-09-07' },
  { id: '5', title: 'Weekend in Lisbon', startDate: '2023-02-17', endDate: '2023-02-19' },
  { id: '6', title: "SF Q4 '23", startDate: '2023-10-15', endDate: '2023-10-22' },
  { id: '7', title: "Seattle Q4 '23", startDate: '2023-10-18', endDate: '2023-10-25' },
  { id: '8', title: 'NYC Day Trip', startDate: '2024-01-20', endDate: '2024-01-20' },
  { id: '9', title: "Berlin '24", startDate: '2024-06-10', endDate: '2024-06-20' },
]
