import { Link } from 'react-router-dom'
import { MapPinned, ArrowRight, Layers, ListChecks, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { useLearningRoutesList } from '@/hooks/use-learning-routes'
import { cn } from '@/lib/utils'

function SkeletonCard() {
  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-3 w-full" />
      </CardContent>
    </Card>
  )
}

export function Component() {
  const { entries, isLoading } = useLearningRoutesList()

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <MapPinned className="h-5 w-5 text-primary" />
          学习路线
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          由管理员精选编排的阶段式刷题路线。沿路线自由练习，每道题答对一次即记为该题通过，进度会同步到图中。
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            暂无已发布的学习路线，敬请期待。
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {entries.map(({ route, stageCount, questionCount, doneCount }) => {
            const percent = questionCount > 0 ? Math.round((doneCount / questionCount) * 100) : 0
            const done = doneCount > 0 && doneCount === questionCount
            return (
              <Card key={route.id} className="flex flex-col">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-start gap-2 leading-snug">
                    <span className="flex-1">{route.title}</span>
                    {done && <Badge className="shrink-0 bg-green-600/90 hover:bg-green-600 text-white"><CheckCircle2 className="h-3 w-3 mr-1" />已完成</Badge>}
                  </CardTitle>
                  {route.description && (
                    <CardDescription className="text-xs leading-relaxed line-clamp-2 whitespace-pre-wrap">
                      {route.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="pt-1 flex-1 flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Layers className="h-3.5 w-3.5" />{stageCount} 个阶段</span>
                    <span className="inline-flex items-center gap-1"><ListChecks className="h-3.5 w-3.5" />{questionCount} 题</span>
                    {questionCount > 0 && <span className={cn('font-medium', done ? 'text-green-600' : 'text-foreground')}>{percent}%</span>}
                  </div>
                  {questionCount > 0 && <Progress value={percent} className="h-1.5" />}
                  <Button asChild variant="outline" className="mt-auto w-fit">
                    <Link to={`/learning-routes/${route.id}`}>
                      查看路线 <ArrowRight className="h-3.5 w-3.5 ml-1" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
