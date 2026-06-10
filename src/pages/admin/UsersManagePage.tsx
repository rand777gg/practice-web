import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Profile } from '@/types'
import { useT } from '@/i18n/use-t'
import { useOnlineUsers } from '@/hooks/use-online-users'

export function Component() {
  const { t } = useT()
  const onlineIds = useOnlineUsers()
  const { user: currentUser, profile: myProfile } = useAuthStore()
  const [profiles, setProfiles] = useState<(Profile & { email?: string; providers?: string[] })[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: true })

      const list = (data ?? []) as (Profile & { email?: string; providers?: string[] })[]

      const [emails, providers] = await Promise.all([
        Promise.all(list.map(async (p) => {
          const { data } = await supabase.rpc('get_user_email', { user_id: p.id })
          return { id: p.id, email: (data as string) ?? '' }
        })),
        Promise.all(list.map(async (p) => {
          const { data } = await supabase.rpc('get_user_providers', { user_id: p.id })
          return { id: p.id, providers: (data as string[]) ?? [] }
        })),
      ])
      const emailMap = new Map(emails.map((e) => [e.id, e.email]))
      const providerMap = new Map(providers.map((p) => [p.id, p.providers]))
      for (const p of list) {
        p.email = emailMap.get(p.id) ?? ''
        p.providers = providerMap.get(p.id) ?? []
      }

      setProfiles(list)
      setIsLoading(false)
    }
    load()
  }, [])

  const toggleRole = async (profile: Profile) => {
    if (profile.id === myProfile?.id) return
    const newRole = profile.role === 'admin' ? 'user' : 'admin'
    await supabase.from('profiles').update({ role: newRole }).eq('id', profile.id)
    setProfiles((prev) =>
      prev.map((p) => (p.id === profile.id ? { ...p, role: newRole as 'admin' | 'user' } : p)),
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-5xl">
        <Skeleton className="h-8 w-48" />
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <Table>
            <TableHeader>
              <TableRow>
                {[...Array(6)].map((_, i) => <TableHead key={i}><Skeleton className="h-4 w-12" /></TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...Array(8)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(6)].map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <h1 className="text-xl lg:text-2xl font-bold">{t('users.title')}</h1>
      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">{t('users.status')}</TableHead>
              <TableHead className="min-w-[120px]">ID</TableHead>
              <TableHead className="min-w-[160px]">{t('users.email')}</TableHead>
              <TableHead>{t('users.role')}</TableHead>
              <TableHead>{t('users.joined')}</TableHead>
              <TableHead className="w-20">{t('users.action')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {profiles.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <span className={`online-dot ${onlineIds.has(p.id) ? '' : 'offline'}`} />
                </TableCell>
                <TableCell className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                  {p.providers?.includes('github') && (
                    <svg className="h-3.5 w-3.5 inline mr-1 -mt-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
                  )}
                  {p.id.slice(0, 8)}
                </TableCell>
                <TableCell className="font-mono text-xs whitespace-nowrap">{p.email || '-'}</TableCell>
                <TableCell>
                  <Badge variant={p.role === 'admin' ? 'default' : 'secondary'} className="whitespace-nowrap">
                    {p.role === 'admin' ? t('users.admin') : t('users.user')}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {new Date(p.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={p.id === currentUser?.id}
                    onClick={() => toggleRole(p)}
                    className="text-xs h-8"
                  >
                    {p.role === 'admin' ? t('users.demote') : t('users.promote')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
