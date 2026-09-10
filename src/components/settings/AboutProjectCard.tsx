import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n/use-t'

const REPO = 'rand777gg/practice-web'
const REPO_URL = `https://github.com/${REPO}`

interface Release {
  id: number
  tag_name: string
  name: string | null
  html_url: string
  published_at: string | null
}

export function AboutProjectCard() {
  const { t } = useT()
  const [releases, setReleases] = useState<Release[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`https://api.github.com/repos/${REPO}/releases?per_page=30`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json()
      })
      .then((data) => {
        if (cancelled) return
        setReleases(Array.isArray(data) ? (data as Release[]) : [])
      })
      .catch(() => {
        if (cancelled) return
        setFailed(true)
        setReleases([])
      })
    return () => { cancelled = true }
  }, [])

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{t('settings.about')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{t('settings.aboutDesc')}</p>

        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-3.5 w-3.5 shrink-0">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
          </svg>
          <span className="truncate">{REPO}</span>
          <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 opacity-60" />
        </a>

        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">{t('settings.releases')}</p>

          {releases === null && (
            <div className="space-y-1.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-full" />
              ))}
            </div>
          )}

          {releases !== null && releases.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {failed ? t('settings.releasesFailed') : t('settings.noReleases')}
            </p>
          )}

          {releases !== null && releases.length > 0 && (
            <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
              {releases.map((release, index) => (
                <a
                  key={release.id}
                  href={release.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 text-xs transition-colors',
                    'hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <span className="shrink-0 font-medium tabular-nums">{release.tag_name}</span>
                  {index === 0 && (
                    <Badge variant="secondary" className="shrink-0 bg-green-100 px-1 py-0 text-[9px] leading-none text-green-700 dark:bg-green-900/40 dark:text-green-300">
                      {t('settings.latest')}
                    </Badge>
                  )}
                  {release.name && <span className="truncate text-muted-foreground">{release.name}</span>}
                  <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
                    {release.published_at?.slice(0, 10)}
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
