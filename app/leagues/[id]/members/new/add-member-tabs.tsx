'use client'

import { useState } from 'react'
import InviteMemberButton from '../../invite-member-button'
import AddPlaceholderForm from '../add-placeholder-form'
import { cn } from 'cn'

/**
 * Tab switcher for the add-member page. Two local-only tabs — a segmented
 * control (there is no Radix tabs in the kit, and these panes don't need
 * keyboard roving beyond tab-through buttons). Server-side authority is
 * already enforced by the page (commissioner) and each action.
 */
type Tab = 'invite' | 'placeholder'

const TABS: { id: Tab; label: string }[] = [
  { id: 'invite', label: 'Invite by link' },
  { id: 'placeholder', label: 'Add placeholder' },
]

export default function AddMemberTabs({ leagueId }: { leagueId: string }) {
  const [tab, setTab] = useState<Tab>('invite')

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="Add member method"
        className="inline-flex rounded-lg border border-border bg-muted p-1"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              tab === t.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        {tab === 'invite' ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Invite by link</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Creates a shareable link (7-day default, unlimited uses). Anyone signed up with it
                joins as a regular member.
              </p>
            </div>
            <InviteMemberButton leagueId={leagueId} />
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Add placeholder</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Reserves a roster seat for someone without an account yet. Obligations, votes and
                awards can already be recorded against them; when they join through an invite
                created on their row, the seat and its history become theirs.
              </p>
            </div>
            <AddPlaceholderForm leagueId={leagueId} />
          </div>
        )}
      </div>
    </div>
  )
}
