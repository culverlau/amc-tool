#!/usr/bin/env node
// Tests seats.js against the shared fixture also used by scripts/test_seat_zone.py.
// Run from repo root: node shared/src/seats.test.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { parseSeat, seatInZone, sortSeats } from './seats.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixture = JSON.parse(readFileSync(path.join(__dirname, '..', 'seat_zone_fixture.json'), 'utf8'))

let passed = 0
let failed = 0

const GREEN_PASS = '\x1b[92mPASS\x1b[0m'
const RED_FAIL = '\x1b[91mFAIL\x1b[0m'

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log(`${ok ? GREEN_PASS : RED_FAIL}  ${label}`)
  if (!ok) console.log(`      expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`)
  ok ? passed++ : failed++
}

for (const c of fixture.parse) {
  check(`parseSeat(${JSON.stringify(c.input)})`, parseSeat(c.input), c.expected)
}

for (const c of fixture.zone) {
  check(`seatInZone(${JSON.stringify(c.seat)}, ${JSON.stringify(c.zone)})`, seatInZone(c.seat, c.zone), c.expected)
}

for (const c of fixture.sort) {
  check(`sortSeats(${JSON.stringify(c.input)})`, sortSeats(c.input), c.expected)
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
