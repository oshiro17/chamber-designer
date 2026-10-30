import type { MeasurementPoint } from './profile'

export const SAMPLE_POINTS: Omit<MeasurementPoint, 'id'>[] = [
  { distance: 0, diameter: 40 },
  { distance: 150, diameter: 40 },
  { distance: 40, diameter: 44 },
  { distance: 130, diameter: 55 },
  { distance: 130, diameter: 90 },
  { distance: 165, diameter: 125 },
  { distance: 150, diameter: 125 },
  { distance: 260, diameter: 25 },
]
