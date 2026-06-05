import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Profile } from '@/types'
import { useT } from '@/i18n/use-t'

export function Component() {
  const { t } = useT()
  const { user: currentUser, profile: myProfile } = useAuthStore()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        setProfiles((data ?? []) as Profile[])
        setIsLoading(false)
      })
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
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-xl lg:text-2xl font-bold">{t('users.title')}</h1>
      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('users.userId')}</TableHead>
              <TableHead>{t('users.role')}</TableHead>
              <TableHead className="hidden sm:table-cell">{t('users.joined')}</TableHead>
              <TableHead>{t('users.action')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {profiles.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.id.slice(0, 8)}...</TableCell>
                <TableCell>
                  <Badge variant={p.role === 'admin' ? 'default' : 'secondary'}>
                    {p.role === 'admin' ? t('users.admin') : t('users.user')}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground hidden sm:table-cell">
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
