/**
 * Seat-zone helpers. A seat name is a row letter followed by a number ("F22").
 * A zone is an inclusive row-letter range plus an inclusive seat-number range.
 */

const SEAT_RE = /^([A-Za-z]+)(\d+)$/

export function parseSeat(name) {
  const m = SEAT_RE.exec(String(name).trim())
  if (!m) return null
  return { row: m[1].toUpperCase(), number: Number(m[2]) }
}

export function seatInZone(name, zone) {
  const seat = parseSeat(name)
  if (!seat) return false
  const rowMin = String(zone.row_min ?? zone.rowMin ?? '').toUpperCase()
  const rowMax = String(zone.row_max ?? zone.rowMax ?? '').toUpperCase()
  const seatMin = Number(zone.seat_min ?? zone.seatMin)
  const seatMax = Number(zone.seat_max ?? zone.seatMax)

  // Row letters compare correctly as strings only when the same length,
  // which is the case for real AMC auditoriums (A-Z, occasionally AA+).
  if (seat.row.length < rowMin.length || seat.row.length > rowMax.length) return false
  if (seat.row < rowMin || seat.row > rowMax) return false
  return seat.number >= seatMin && seat.number <= seatMax
}

export function filterSeatsToZone(seats, zone) {
  return (seats || []).filter((s) => seatInZone(s, zone))
}

/** Sort seats for display: by row letter, then seat number. */
export function sortSeats(seats) {
  return [...(seats || [])].sort((a, b) => {
    const pa = parseSeat(a)
    const pb = parseSeat(b)
    if (!pa || !pb) return String(a).localeCompare(String(b))
    return pa.row === pb.row ? pa.number - pb.number : pa.row.localeCompare(pb.row)
  })
}

export const DEFAULT_ZONE = { row_min: 'E', row_max: 'L', seat_min: 7, seat_max: 36 }
