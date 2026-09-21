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
        <Breadcrumb>
          <BreadcrumbList>
            {crumbs.map((crumb, i) => {
              const isLast = i === crumbs.length - 1
              return (
                <Fragment key={crumb.url ?? `${crumb.title}-${i}`}>
                  <BreadcrumbItem>
                    {crumb.menu ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger className="flex items-center gap-1 text-sm font-normal text-foreground transition-colors hover:text-muted-foreground">
                          <span className="line-clamp-1">{crumb.title}</span>
                          <ChevronDown className="size-3.5" />
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
                        <Link to={crumb.url}>{crumb.title}</Link>
                      </BreadcrumbLink>
                    ) : !isLast ? (
                      <span className="text-muted-foreground">{crumb.title}</span>
                    ) : (
                      <BreadcrumbPage className="line-clamp-1">{crumb.title}</BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                  {!isLast && <BreadcrumbSeparator />}
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
