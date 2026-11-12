import AppShell from '@/src/components/app-shell'

export const dynamic = 'force-dynamic'

export default function LeaguesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AppShell>{children}</AppShell>
}