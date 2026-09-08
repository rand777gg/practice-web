import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  ArrowLeft,
  Bell,
  BellRing,
  Check,
  ClipboardList,
  Copy,
  DoorOpen,
  LogOut,
  Plus,
  RefreshCw,
  Trash2,
  UserMinus,
  UsersRound,
} from 'lucide-react'

interface RoomRow {
  id: string
  owner_id: string
  name: string
  description: string
  invite_code: string
  created_at: string
}

interface RoomMember {
  user_id: string
  nickname: string
  is_owner: boolean
  has_goal: boolean
  done: boolean
  today_goal: number
  today_done: number
  last_reminded_at: string | null
}

interface RoomDetail {
  room: RoomRow
  date: string
  members: RoomMember[]
}

const REMIND_COOLDOWN_MS = 2 * 60 * 60 * 1000

function errText(code: string | null | undefined): string {
  switch (code) {
    case 'invalid_code': return '邀请码不存在或已失效'
    case 'already_member': return '你已经在自习室里了'
    case 'room_not_found': return '自习室不存在'
    case 'forbidden': return '你不是该自习室成员'
    case 'unauthorized': return '请先登录'
    case 'resend_not_configured': return '邮件服务尚未配置（需要 RESEND_API_KEY / RESEND_FROM）'
    default: return '操作失败，请稍后重试'
  }
}

/** 调 Edge Function study-room, 统一错误信息 */
async function invokeRoom<T>(body: Record<string, unknown>): Promise<{ data: T | null; message: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke<T>('study-room', { body })
    if (error) {
      let code: string | null = null
      try {
        const res = (error as unknown as { context?: Response }).context
        if (res) {
          const j = (await res.clone().json()) as { error?: string }
          code = j?.error ?? null
        }
      } catch {
        // ignore
      }
      return { data: null, message: errText(code) }
    }
    return { data: data ?? null, message: null }
  } catch {
    return { data: null, message: errText(null) }
  }
}

function CardShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('overflow-hidden rounded-xl border bg-card', className)}>{children}</div>
}

function StatusChip({ m }: { m: RoomMember }) {
  if (!m.has_goal) {
    return <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">未设目标</span>
  }
  if (m.done) {
    return (
      <span className="flex items-center gap-0.5 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
        <Check className="h-3 w-3" /> 已完成
      </span>
    )
  }
  return <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">未完成</span>
}

export function Component() {
  const { user } = useAuthStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const roomParam = searchParams.get('room')

  const [rooms, setRooms] = useState<RoomRow[] | null>(null)
  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({})
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({})
  const [listError, setListError] = useState('')
  const [listVersion, setListVersion] = useState(0)

  const [createOpen, setCreateOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)

  const [detail, setDetail] = useState<RoomDetail | null>(null)
  const [detailError, setDetailError] = useState('')
  const [detailVersion, setDetailVersion] = useState(0)
  const [detailRefreshing, setDetailRefreshing] = useState(false)
  const [actionMsg, setActionMsg] = useState('')
  const [reminding, setReminding] = useState(false)
  const [copied, setCopied] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const busyRef = useRef(false)

  const me = user?.id
  const openRoomId = roomParam && /^[0-9a-f-]{36}$/i.test(roomParam) ? roomParam : null

  const bumpList = () => setListVersion((v) => v + 1)
  const bumpDetail = () => setDetailVersion((v) => v + 1)

  // 房间列表
  useEffect(() => {
    if (!me) return
    let cancelled = false
    ;(async () => {
      const { data: roomRows, error } = await supabase
        .from('study_rooms')
        .select('*')
        .order('created_at', { ascending: false })
      if (cancelled) return
      if (error) {
        setListError(error.message)
        setRooms([])
        return
      }
      const list = (roomRows ?? []) as unknown as RoomRow[]
      setRooms(list)

      const ids = list.map((r) => r.id)
      if (ids.length === 0) {
        setMemberCounts({})
        setOwnerNames({})
        return
      }
      const { data: mrows } = await supabase.from('study_room_members').select('room_id, user_id').in('room_id', ids)
      if (cancelled) return
      const counts: Record<string, number> = {}
      for (const m of (mrows ?? []) as { room_id: string; user_id: string }[]) {
        counts[m.room_id] = (counts[m.room_id] ?? 0) + 1
      }
      setMemberCounts(counts)

      const ownerIds = [...new Set(list.map((r) => r.owner_id))]
      const { data: nickRows } = await supabase.rpc('get_profile_nicknames', { user_ids: ownerIds })
      if (cancelled) return
      const names: Record<string, string> = {}
      for (const p of (nickRows ?? []) as { id: string; nickname: string | null }[]) {
        names[p.id] = p.nickname || `用户${p.id.slice(0, 6)}`
      }
      setOwnerNames(names)
    })()
    return () => { cancelled = true }
  }, [me, listVersion])

  // 房间详情(打卡状态, 由 Edge Function 计算)
  useEffect(() => {
    if (!openRoomId) return
    let cancelled = false
    ;(async () => {
      setDetailRefreshing(true)
      const { data, message } = await invokeRoom<RoomDetail>({ action: 'status', roomId: openRoomId })
      if (cancelled) return
      setDetailRefreshing(false)
      if (message) {
        setDetailError(message)
        setDetail(null)
      } else {
        setDetailError('')
        setDetail(data)
      }
    })()
    return () => { cancelled = true }
  }, [openRoomId, detailVersion])

  // 每 30 秒刷新“已提醒”冷却时间戳; 房间打开时顺带刷打卡状态
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now())
      if (openRoomId && !busyRef.current) bumpDetail()
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [openRoomId])

  const openRoom = (id: string) => {
    if (openRoomId === id) {
      bumpDetail()
      return
    }
    setDetail(null)
    setDetailError('')
    setActionMsg('')
    setSearchParams({ room: id })
  }
  const closeRoom = () => {
    setDetail(null)
    setDetailError('')
    setActionMsg('')
    setSearchParams({})
  }

  const handleCreate = async (name: string, description: string) => {
    const { data, error } = await supabase.rpc('create_study_room', { p_name: name, p_description: description })
    if (error) {
      setListError(errText(error.message))
      return false
    }
    const row = ((data ?? []) as RoomRow[])[0]
    bumpList()
    if (row) setSearchParams({ room: row.id })
    return true
  }

  const handleJoin = async (code: string) => {
    const { data, error } = await supabase.rpc('join_study_room', { p_code: code })
    if (error) {
      setListError(errText(error.message))
      return false
    }
    const row = ((data ?? []) as { id: string; room_id: string }[])[0]
    bumpList()
    if (row?.room_id) setSearchParams({ room: row.room_id })
    return true
  }

  const handleLeaveRoom = async (roomId: string) => {
    if (!me) return
    if (!window.confirm('确定退出这个自习室吗？')) return
    const { error } = await supabase.from('study_room_members').delete().eq('room_id', roomId).eq('user_id', me)
    if (error) {
      setActionMsg(error.message)
      return
    }
    closeRoom()
    bumpList()
  }

  const handleDeleteRoom = async (roomId: string) => {
    if (!window.confirm('确定解散这个自习室吗？所有成员都会被移出。')) return
    const { error } = await supabase.from('study_rooms').delete().eq('id', roomId)
    if (error) {
      setActionMsg(error.message)
      return
    }
    closeRoom()
    bumpList()
  }

  const handleRemoveMember = async (roomId: string, memberId: string, nickname: string) => {
    if (!window.confirm(`确定把 ${nickname} 移出自习室吗？`)) return
    const { error } = await supabase.from('study_room_members').delete().eq('room_id', roomId).eq('user_id', memberId)
    if (error) {
      setActionMsg(error.message)
      return
    }
    bumpDetail()
  }

  const doRemind = async (memberIds?: string[]) => {
    if (!openRoomId) return
    busyRef.current = true
    setReminding(true)
    setActionMsg('')
    const { data, message } = await invokeRoom<{ sent: { user_id: string }[]; skipped: { user_id: string; reason: string }[] }>({
      action: 'remind',
      roomId: openRoomId,
      memberIds: memberIds && memberIds.length > 0 ? memberIds : undefined,
    })
    busyRef.current = false
    setReminding(false)
    if (message) {
      setActionMsg(message)
      return
    }
    const sent = (data?.sent ?? []).length
    const failed = (data?.skipped ?? []).filter((s) => s.reason === 'send_failed').length
    if (sent > 0) {
      setActionMsg(`已向 ${sent} 位成员发送提醒邮件${failed > 0 ? `，${failed} 位发送失败` : ''}`)
    } else if (failed > 0) {
      setActionMsg('邮件发送失败，请稍后重试')
    } else {
      setActionMsg('今天没有需要提醒的成员（都已完成，或刚提醒过）')
    }
    bumpDetail()
  }

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  // ---------- 房间详情 ----------
  if (openRoomId) {
    const isOwner = detail?.room.owner_id === me
    const pendingRemindCount = (detail?.members ?? []).filter(
      (m) => m.has_goal && !m.done && (!m.last_reminded_at || nowMs - new Date(m.last_reminded_at).getTime() > REMIND_COOLDOWN_MS),
    ).length

    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={closeRoom}>
            <ArrowLeft className="h-3.5 w-3.5" /> 返回
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold">{detail ? detail.room.name : '自习室'}</h1>
            {detail?.room.description && <p className="truncate text-xs text-muted-foreground">{detail.room.description}</p>}
          </div>
          <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={bumpDetail}>
            <RefreshCw className={cn('h-3.5 w-3.5', detailRefreshing && 'animate-spin')} />
            刷新
          </Button>
          {isOwner ? (
            <Button variant="outline" size="sm" className="gap-1 text-xs text-destructive" onClick={() => handleDeleteRoom(openRoomId)}>
              <Trash2 className="h-3.5 w-3.5" /> 解散
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => handleLeaveRoom(openRoomId)}>
              <LogOut className="h-3.5 w-3.5" /> 退出
            </Button>
          )}
        </div>

        {actionMsg && <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">{actionMsg}</p>}
        {detailError && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <span className="flex-1">{detailError}</span>
            <Button variant="outline" size="sm" className="h-6 text-[11px]" onClick={bumpDetail}>重试</Button>
          </div>
        )}

        {detail && (
          <>
            <CardShell>
              <div className="border-b px-4 py-3">
                <p className="text-xs text-muted-foreground">邀请码</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <code className="rounded-md border bg-muted px-3 py-1.5 text-sm font-semibold tracking-[0.3em]">{detail.room.invite_code}</code>
                  <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => copyCode(detail.room.invite_code)}>
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? '已复制' : '复制'}
                  </Button>
                </div>
                <p className="mt-1.5 text-[10px] text-muted-foreground">把邀请码发给好友，凭码加入即可一起监督打卡</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 px-4 py-3">
                <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                  打卡口径：完成今日计划目标（北京时间 {detail.date}）· 每 30 秒自动刷新
                </p>
                <Button
                  size="sm"
                  className="gap-1 text-xs"
                  disabled={reminding || pendingRemindCount === 0}
                  onClick={() => doRemind()}
                  title={pendingRemindCount === 0 ? '没有需要提醒的成员' : undefined}
                >
                  {reminding ? <Spinner className="h-3.5 w-3.5" /> : <BellRing className="h-3.5 w-3.5" />}
                  提醒未打卡成员（{pendingRemindCount}）
                </Button>
              </div>
            </CardShell>

            <CardShell>
              <div className="border-b px-4 py-2.5 text-xs font-medium text-muted-foreground">成员（{detail.members.length}）</div>
              <ul className="divide-y">
                {detail.members.map((m) => {
                  const recentlyReminded =
                    m.last_reminded_at && nowMs - new Date(m.last_reminded_at).getTime() < REMIND_COOLDOWN_MS
                  const canRemind = m.has_goal && !m.done && !recentlyReminded
                  return (
                    <li key={m.user_id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {m.nickname.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-medium">
                            {m.nickname}
                            {m.user_id === me && <span className="ml-1 text-xs text-muted-foreground">（我）</span>}
                          </span>
                          {m.is_owner && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">房主</span>}
                          <StatusChip m={m} />
                        </div>
                        {m.has_goal && (
                          <div className="mt-1.5 flex items-center gap-2">
                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn('h-full rounded-full', m.done ? 'bg-emerald-500' : 'bg-amber-500')}
                                style={{ width: `${m.today_goal > 0 ? Math.min((m.today_done / m.today_goal) * 100, 100) : 0}%` }}
                              />
                            </div>
                            <span className="text-[10px] tabular-nums text-muted-foreground">
                              {m.today_done}/{m.today_goal}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {canRemind && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1 text-xs"
                            disabled={reminding}
                            onClick={() => doRemind([m.user_id])}
                          >
                            {reminding ? <Spinner className="h-3 w-3" /> : <Bell className="h-3 w-3" />}
                            提醒
                          </Button>
                        )}
                        {recentlyReminded && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">已提醒</span>
                        )}
                        {isOwner && !m.is_owner && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            title={`移出 ${m.nickname}`}
                            onClick={() => handleRemoveMember(openRoomId, m.user_id, m.nickname)}
                          >
                            <UserMinus className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </CardShell>
          </>
        )}

        {!detail && !detailError && (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
            <Spinner className="h-4 w-4" /> 加载打卡状态…
          </div>
        )}

        <CreateRoomDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} />
      </div>
    )
  }

  // ---------- 房间列表 ----------
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-1.5 text-base font-semibold">
            <UsersRound className="h-4 w-4 text-primary" /> 自习室
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">拉上好友组个自习室，互相监督，完成每天的练习计划。</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => setJoinOpen(true)}>
            <DoorOpen className="h-3.5 w-3.5" /> 输入邀请码
          </Button>
          <Button size="sm" className="gap-1 text-xs" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> 创建自习室
          </Button>
        </div>
      </div>

      {listError && <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{listError}</p>}

      {rooms === null ? (
        <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
          <Spinner className="h-4 w-4" /> 加载中…
        </div>
      ) : rooms.length === 0 ? (
        <CardShell>
          <div className="px-6 py-14 text-center">
            <UsersRound className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">还没有自习室</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground/70">
              创建一个自习室并分享邀请码，或输入好友的邀请码加入。每天完成计划目标的成员会被标记为已打卡。
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setJoinOpen(true)}>输入邀请码加入</Button>
              <Button size="sm" onClick={() => setCreateOpen(true)}>创建自习室</Button>
            </div>
          </div>
        </CardShell>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rooms.map((r) => {
            const count = memberCounts[r.id] ?? 1
            const ownerName = ownerNames[r.owner_id] ?? '用户'
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => openRoom(r.id)}
                className="group rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{r.name}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <UsersRound className="h-3 w-3" /> {count} 人 · 房主 {ownerName}
                    </p>
                  </div>
                  <ClipboardList className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-primary" />
                </div>
                {r.description && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{r.description}</p>}
                <p className="mt-3 flex items-center gap-1 text-[11px] text-muted-foreground/80">
                  邀请码 <code className="rounded bg-muted px-1.5 py-0.5 font-semibold tracking-widest">{r.invite_code}</code>
                </p>
              </button>
            )
          })}
        </div>
      )}

      <CreateRoomDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} />
      <JoinRoomDialog open={joinOpen} onOpenChange={setJoinOpen} onJoin={handleJoin} />
    </div>
  )
}

// ---------- 创建对话框 ----------
function CreateRoomDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreate: (name: string, description: string) => Promise<boolean>
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    const n = name.trim()
    if (!n) {
      setErr('请填写自习室名称')
      return
    }
    setSaving(true)
    setErr('')
    const ok = await onCreate(n, description.trim())
    setSaving(false)
    if (ok) {
      setName('')
      setDescription('')
      onOpenChange(false)
    } else {
      setErr('创建失败，请重试')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onOpenChange(false) }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>创建自习室</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">名称</Label>
            <Input value={name} placeholder="比如：考研冲刺小组" onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">简介（可选）</Label>
            <Textarea value={description} placeholder="一句话说明这个自习室的目标…" onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
        </div>
        <DialogFooter className="mt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>取消</Button>
          <Button size="sm" disabled={saving} onClick={submit}>
            {saving ? <Spinner className="h-3.5 w-3.5" /> : null}
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------- 加入对话框 ----------
function JoinRoomDialog({
  open,
  onOpenChange,
  onJoin,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onJoin: (code: string) => Promise<boolean>
}) {
  const [code, setCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    const c = code.trim().toUpperCase()
    if (c.length < 6) {
      setErr('邀请码为 6 位')
      return
    }
    setSaving(true)
    setErr('')
    const ok = await onJoin(c)
    setSaving(false)
    if (ok) {
      setCode('')
      onOpenChange(false)
    } else {
      setErr('加入失败：邀请码不存在或已失效，或你已在该自习室')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onOpenChange(false) }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>输入邀请码加入</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">邀请码</Label>
            <Input
              value={code}
              placeholder="6 位邀请码，如 AB3XYZ"
              maxLength={6}
              className="font-mono uppercase tracking-[0.3em]"
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              autoFocus
            />
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
        </div>
        <DialogFooter className="mt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>取消</Button>
          <Button size="sm" disabled={saving} onClick={submit}>
            {saving ? <Spinner className="h-3.5 w-3.5" /> : null}
            加入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
