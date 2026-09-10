import { SidebarTrigger } from '@/components/ui/sidebar'
import { HeaderActions } from './HeaderActions'
import { HeaderPlanMenu } from './HeaderPlanMenu'

export function Header() {
  return (
    <header className="sticky top-0 z-20 h-14 shrink-0 border-b bg-background flex items-center gap-2 px-4 xl:px-6">
      <SidebarTrigger className="-ml-1" />
      <HeaderPlanMenu />
      <HeaderActions />
    </header>
  )
}
