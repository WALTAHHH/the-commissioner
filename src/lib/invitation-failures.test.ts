/**
 * Verification for describeInvitationFailure (invite error surfacing).
 * No test runner — repo convention (see search.test.ts). Run with:
 *
 *   npx tsx src/lib/invitation-failures.test.ts
 *
 * Asserts the Postgres/PostgREST codes the redeem flow can actually raise map
 * to distinct, non-generic copy, that the code is echoed for the UI's support
 * line, and that an unknown/absent failure falls back to the generic retry
 * message without inventing a code. Exits 1 if any assertion fails.
 */
import assert from 'node:assert/strict'
import {
  describeInvitationFailure,
  type DatabaseFailure,
} from './invitations'

let failures = 0
function check(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ok  ${name}`)
  } catch (err) {
    failures++
    console.error(`FAIL  ${name}`)
    console.error(err)
  }
}

const GENERIC = 'Could not join the league. Please try again.'

check('23503 (FK: user row missing) names the account-setup cause', () => {
  const copy = describeInvitationFailure({ code: '23503', message: 'violates fk' })
  assert.equal(copy.code, '23503')
  assert.match(copy.message, /account isn’t fully set up yet/)
  assert.notEqual(copy.message, GENERIC)
})

check('23505 (unique: membership exists) reports already a member', () => {
  const copy = describeInvitationFailure({ code: '23505' })
  assert.equal(copy.code, '23505')
  assert.match(copy.message, /already a member of this league/)
})

check('42703 / 42P01 / PGRST204 name a pending deployment migration', () => {
  for (const code of ['42703', '42P01', 'PGRST204']) {
    const copy = describeInvitationFailure({ code })
    assert.equal(copy.code, code, `code echoed for ${code}`)
    assert.match(copy.message, /isn’t available on this deployment yet/)
    assert.notEqual(copy.message, GENERIC, `${code} must not be the generic message`)
  }
})

check('the three real causes are mutually distinct', () => {
  const messages = ['23503', '23505', '42703'].map(
    (code) => describeInvitationFailure({ code }).message,
  )
  assert.equal(new Set(messages).size, 3)
  assert.ok(!messages.includes(GENERIC))
})

check('unknown code keeps the generic copy but still echoes the code', () => {
  const copy = describeInvitationFailure({ code: 'XX000', message: 'boom' })
  assert.equal(copy.message, GENERIC)
  assert.equal(copy.code, 'XX000')
})

check('absent failure → generic copy, no code', () => {
  for (const input of [undefined, null, {} as DatabaseFailure]) {
    const copy = describeInvitationFailure(input)
    assert.equal(copy.message, GENERIC)
    assert.equal(copy.code, undefined)
  }
})

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nall invitation-failure checks passed')
