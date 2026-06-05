import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/use-t'

export function Component() {
  const { t } = useT()
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">404</h1>
        <p className="text-muted-foreground">{t('common.notFound')}</p>
        <Button asChild>
          <Link to="/">{t('common.goDashboard')}</Link>
        </Button>
      </div>
    </div>
  )
}
