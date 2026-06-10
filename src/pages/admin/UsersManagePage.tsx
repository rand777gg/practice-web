import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LoadingTips } from '@/components/layout/LoadingTips'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Profile } from '@/types'
import { useT } from '@/i18n/use-t'
import { useOnlineUsers } from '@/hooks/use-online-users'

export function Component() {
  const { t } = useT()
  const onlineIds = useOnlineUsers()
  const { user: currentUser, profile: myProfile } = useAuthStore()
  const [profiles, setProfiles] = useState<(Profile & { email?: string })[]>([])
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
      <LoadingTips className="py-12" compact />
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
              <TableHead className="w-20">GitHub</TableHead>
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
                <TableCell className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">{p.id.slice(0, 8)}</TableCell>
                <TableCell className="font-mono text-xs whitespace-nowrap">{p.email || '-'}</TableCell>
                <TableCell>
                  {p.providers?.includes('github') ? (
                    <Badge variant="default" className="text-[10px]">GitHub</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={p.role === 'admin' ? 'default' : 'secondary'}>
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
