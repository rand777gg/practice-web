import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronDown } from 'lucide-react'

import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { NavActions } from './NavActions'
import { usePageCrumbs } from './nav-data'

export function Header() {
  const crumbs = usePageCrumbs()

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background">
      <div className="flex min-w-0 flex-1 items-center gap-2 px-4 xl:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb className="min-w-0">
          <BreadcrumbList className="flex-nowrap">
            {crumbs.map((crumb, i) => {
              const isLast = i === crumbs.length - 1
              // 窄屏只留当前页那一段(它的下拉最有用); 祖先层级交给侧边栏抽屉和底部导航
              return (
                <Fragment key={crumb.url ?? `${crumb.title}-${i}`}>
                  <BreadcrumbItem className={cn('min-w-0', !isLast && 'hidden lg:inline-flex')}>
                    {crumb.menu ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger className="flex min-w-0 items-center gap-1 text-sm font-normal text-foreground transition-colors hover:text-muted-foreground">
                          <span className="truncate">{crumb.title}</span>
                          <ChevronDown className="size-3.5 shrink-0" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          {crumb.menu.map((item) => (
                            <DropdownMenuItem key={item.url} asChild>
                              <Link to={item.url} className={cn('gap-2', item.active && 'font-medium')}>
                                {item.icon && <item.icon className="size-4 text-muted-foreground" />}
                                {item.title}
                                {item.active && <Check className="ml-auto size-4" />}
                              </Link>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : !isLast && crumb.url ? (
                      <BreadcrumbLink asChild>
                        <Link to={crumb.url} className="truncate">{crumb.title}</Link>
                      </BreadcrumbLink>
                    ) : !isLast ? (
                      <span className="truncate text-muted-foreground">{crumb.title}</span>
                    ) : (
                      <BreadcrumbPage className="truncate">{crumb.title}</BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                  {!isLast && <BreadcrumbSeparator className="hidden lg:block" />}
                </Fragment>
              )
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="px-4 xl:px-6">
        <NavActions />
      </div>
    </header>
  )
}
