import { Fragment } from 'react'
import { Link } from 'react-router-dom'

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
            {crumbs.map((crumb, i) => (
              <Fragment key={crumb.url ?? crumb.title}>
                {i < crumbs.length - 1 ? (
                  <>
                    <BreadcrumbItem>
                      <BreadcrumbLink asChild>
                        <Link to={crumb.url ?? '/'}>{crumb.title}</Link>
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                  </>
                ) : (
                  <BreadcrumbItem>
                    <BreadcrumbPage className="line-clamp-1">{crumb.title}</BreadcrumbPage>
                  </BreadcrumbItem>
                )}
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="px-4 xl:px-6">
        <NavActions />
      </div>
    </header>
  )
}
