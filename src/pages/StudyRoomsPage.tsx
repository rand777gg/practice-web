import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { logError, userMessage } from '@/services/errors'
import { updateProfile } from '@/services/profiles'
import {
  deleteStudyRoom,
  fetchRoomMembers,
  fetchStudyRooms,
  removeRoomMember,
  type StudyRoom,
  type StudyRoomMember,
} from '@/services/study-rooms'
import { useAuthStore } from '@/stores/auth-store'
import { useOnlineStore } from '@/stores/online-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { UserAvatar } from '@/components/ui/user-avatar'
import type { AvatarOwner } from '@/lib/avatar'
import { EXAM_GOALS } from '@/lib/exam-goals'
import {
  EXAM_STATUSES,
  examStatusLabel,
  parseVisibility,
  serializeVisibility,
  type ProfileVisibility,
  type PublicProfile,
} from '@/lib/public-profile'
import {
  ArrowLeft,
  Bell,
  BellRing,
  Check,
  ClipboardList,
  Copy,
  DoorOpen,
  Flame,
  GraduationCap,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  Target,
  Trash2,
  UserMinus,
  UserRoundCog,
  UsersRound,
} from 'lucide-react'
import { Separator } from '@/components/ui/separator'

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
  room: StudyRoom
  date: string
  members: RoomMember[]
}

const REMIND_COOLDOWN_MS = 2 * 60 * 60 * 1000

/** 与 landing page 的演示面板同一套外壳: 圆角大卡 + 顶部信息条 */
const PANEL = 'overflow-hidden rounded-2xl border bg-card shadow-xl shadow-primary/5'
const BAR = 'flex items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground'

type ProfileMap = Record<string, PublicProfile>

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

function shortId(id: string) {
  return `用户${id.slice(0, 6)}`
}

function nickOf(id: string, profiles: ProfileMap, fallback?: string | null) {
  return profiles[id]?.nickname?.trim() || fallback?.trim() || shortId(id)
}

function avatarOwnerOf(id: string, profiles: ProfileMap, fallback?: string | null): AvatarOwner {
  const p = profiles[id]
  return {
    id,
    name: nickOf(id, profiles, fallback),
    avatarUrl: p?.avatar_url ?? null,
    avatarPreset: p?.avatar_preset ?? null,
  }
}

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn(PANEL, className)}>{children}</div>
}

/** 成员头像堆叠(landing 星空自习室同款): 线上的人带一个绿点 */
function AvatarStack({
  ids,
  profiles,
  onlineIds,
  max = 6,
  className,
}: {
  ids: string[]
  profiles: ProfileMap
  onlineIds: Set<string>
  max?: number
  className?: string
}) {
  const shown = ids.slice(0, max)
  const rest = ids.length - shown.length
  return (
    <div className={cn('flex items-center', className)}>
      {shown.map((id, i) => (
        <span key={id} className={cn('relative', i > 0 && '-ml-2')} style={{ zIndex: shown.length - i }}>
          <UserAvatar owner={avatarOwnerOf(id, profiles)} size="sm" className="h-7 w-7 ring-2 ring-card" />
          {onlineIds.has(id) && (
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-card" />
          )}
        </span>
      ))}
      {rest > 0 && (
        <span className="-ml-2 flex h-7 items-center rounded-full bg-muted px-2 text-[10px] font-medium text-muted-foreground ring-2 ring-card">
          +{rest}
        </span>
      )}
    </div>
  )
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

function PubChip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
      <span className="text-primary/70">{icon}</span>
      {children}
    </span>
  )
}

/** 成员自己勾选公开的备考资料; 没勾的一律不显示 */
function PublicBadges({ p }: { p?: PublicProfile }) {
  if (!p) return null
  const goal = EXAM_GOALS.find((g) => g.value === p.goal_type)?.label
  const status = examStatusLabel(p.exam_status)
  if (!goal && !status && !p.target_school) return null
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {goal && <PubChip icon={<Target className="h-2.5 w-2.5" />}>备考目标<Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />{goal}</PubChip>}
      {status && <PubChip icon={<Flame className="h-2.5 w-2.5" />}>{status}</PubChip>}
      {p.target_school && <PubChip icon={<GraduationCap className="h-2.5 w-2.5" />}>目标院校<Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />{p.target_school}</PubChip>}
    </div>
  )
}

export function Component() {
  const { user, profile } = useAuthStore()
  const onlineIds = useOnlineStore((s) => s.onlineIds)
  const [searchParams, setSearchParams] = useSearchParams()
  const roomParam = searchParams.get('room')

  const [rooms, setRooms] = useState<StudyRoom[] | null>(null)
  const [roomMembers, setRoomMembers] = useState<Record<string, string[]>>({})
  const [profiles, setProfiles] = useState<ProfileMap>({})
  const [listError, setListError] = useState('')
  const [listVersion, setListVersion] = useState(0)

  const [createOpen, setCreateOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)

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
  /** 打开公开资料后立刻把新设置应用到列表上 */
  const applyPublicProfiles = (rows: PublicProfile[]) => {
    if (rows.length === 0) return
    setProfiles((prev) => {
      const next = { ...prev }
      for (const p of rows) next[p.id] = p
      return next
    })
  }

  // 房间列表 + 每个房间的成员头像
  useEffect(() => {
    if (!me) return
    let cancelled = false
    ;(async () => {
      let list: StudyRoom[]
      try {
        list = await fetchStudyRooms()
      } catch (e) {
        logError('StudyRoomsPage.fetchRooms', e)
        if (!cancelled) {
          setListError(userMessage(e))
          setRooms([])
        }
        return
      }
      if (cancelled) return
      setRooms(list)

      const ids = list.map((r) => r.id)
      if (ids.length === 0) {
        setRoomMembers({})
        return
      }
      let mrows: StudyRoomMember[] = []
      try {
        mrows = await fetchRoomMembers(ids)
      } catch (e) {
        // 成员拉不到时卡片照常渲染, 只是头像为空 —— 与旧行为一致
        logError('StudyRoomsPage.fetchRoomMembers', e)
      }
      if (cancelled) return
      const grouped: Record<string, string[]> = {}
      for (const r of list) grouped[r.id] = []
      const allIds = new Set<string>()
      for (const m of mrows) {
        if (!grouped[m.room_id]) grouped[m.room_id] = []
        if (!grouped[m.room_id].includes(m.user_id)) grouped[m.room_id].push(m.user_id)
        allIds.add(m.user_id)
      }
      setRoomMembers(grouped)

      const userIds = [...allIds]
      if (userIds.length === 0) return
      const { data: cards } = await supabase.rpc('get_public_profiles', { user_ids: userIds })
      if (cancelled) return
      applyPublicProfiles((cards ?? []) as PublicProfile[])
    })()
    return () => { cancelled = true }
  }, [me, listVersion])

  // 房间详情(打卡状态, 由 Edge Function 计算) + 成员公开资料
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
        return
      }
      setDetailError('')
      setDetail(data)
      const memberIds = (data?.members ?? []).map((m) => m.user_id)
      if (memberIds.length > 0) {
        const { data: cards } = await supabase.rpc('get_public_profiles', { user_ids: memberIds })
        if (cancelled) return
        applyPublicProfiles((cards ?? []) as PublicProfile[])
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
    const row = ((data ?? []) as StudyRoom[])[0]
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
    try {
      await removeRoomMember(roomId, me)
    } catch (e) {
      logError('StudyRoomsPage.leaveRoom', e)
      setActionMsg(userMessage(e))
      return
    }
    closeRoom()
    bumpList()
  }

  const handleDeleteRoom = async (roomId: string) => {
    if (!window.confirm('确定解散这个自习室吗？所有成员都会被移出。')) return
    try {
      await deleteStudyRoom(roomId)
    } catch (e) {
      logError('StudyRoomsPage.deleteRoom', e)
      setActionMsg(userMessage(e))
      return
    }
    closeRoom()
    bumpList()
  }

  const handleRemoveMember = async (roomId: string, memberId: string, nickname: string) => {
    if (!window.confirm(`确定把 ${nickname} 移出自习室吗？`)) return
    try {
      await removeRoomMember(roomId, memberId)
    } catch (e) {
      logError('StudyRoomsPage.removeMember', e)
      setActionMsg(userMessage(e))
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
    const sentN = (data?.sent ?? []).length
    const skipped = data?.skipped ?? []
    const byReason = (r: string) => skipped.filter((s) => s.reason === r).length
    const failN = byReason('send_failed')
    const doneN = byReason('already_done')
    const noGoalN = byReason('no_goal')
    const throttledN = byReason('throttled')
    const parts: string[] = []
    if (doneN > 0) parts.push(`${doneN} 位已完成`)
    if (noGoalN > 0) parts.push(`${noGoalN} 位未设目标`)
    if (throttledN > 0) parts.push(`${throttledN} 位 2 小时内已提醒`)
    if (failN > 0) parts.push(`${failN} 位发送失败`)
    if (sentN > 0) {
      setActionMsg(`已向 ${sentN} 位成员发送提醒邮件${parts.length > 0 ? `（${parts.join('，')}）` : ''}`)
    } else if (parts.length > 0) {
      setActionMsg(parts.join('，') + '，未发送提醒邮件')
    } else {
      setActionMsg('今天没有需要提醒的成员')
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

  const myVisibility = useMemo(() => parseVisibility(profile?.profile_visibility), [profile?.profile_visibility])
  const myPublicCount =
    (myVisibility.goal_type && profile?.goal_type ? 1 : 0) +
    (myVisibility.exam_status && profile?.exam_status ? 1 : 0) +
    (myVisibility.target_school && profile?.target_school ? 1 : 0)

  // ---------- 房间详情 ----------
  if (openRoomId) {
    const isOwner = detail?.room.owner_id === me
    const members = detail?.members ?? []
    const memberIds = members.map((m) => m.user_id)
    const pendingRemindCount = members.filter(
      (m) => m.has_goal && !m.done && (!m.last_reminded_at || nowMs - new Date(m.last_reminded_at).getTime() > REMIND_COOLDOWN_MS),
    ).length
    const goalCount = members.filter((m) => m.has_goal).length
    const doneCount = members.filter((m) => m.done).length
    const onlineCount = memberIds.filter((id) => onlineIds.has(id)).length
    const myMember = members.find((m) => m.user_id === me)

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
          <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => setProfileOpen(true)}>
            <UserRoundCog className="h-3.5 w-3.5" /> 我的公开资料
          </Button>
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
            <Panel>
              <div className={BAR}>
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <UsersRound className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="truncate font-medium text-foreground">{detail.room.name}</span>
                </span>
                <span className="shrink-0">北京时间 {detail.date}</span>
              </div>
              <div className="space-y-4 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
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
                  <div className="flex flex-col items-end gap-2">
                    <AvatarStack ids={memberIds} profiles={profiles} onlineIds={onlineIds} />
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      在线 {onlineCount} / {members.length} 人
                    </span>
                  </div>
                </div>

                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <Flame className={cn('h-3.5 w-3.5', myMember?.done ? 'text-emerald-500' : 'text-amber-500')} />
                      今日打卡 {doneCount}/{goalCount} 人
                    </span>
                    <span className="text-muted-foreground">每 30 秒自动刷新</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-[width] duration-700 ease-out"
                      style={{ width: `${goalCount > 0 ? Math.round((doneCount / goalCount) * 100) : 0}%` }}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                  <p className="text-[11px] text-muted-foreground">
                    打卡口径：完成今日计划目标{myMember && !myMember.has_goal ? '（你还没设置计划目标）' : ''}
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
              </div>
            </Panel>

            {myPublicCount === 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1">你还没有公开任何备考资料，同学只看到你的昵称和头像。</span>
                <Button variant="outline" size="sm" className="h-6 text-[11px]" onClick={() => setProfileOpen(true)}>
                  去公开
                </Button>
              </div>
            )}

            <Panel>
              <div className={BAR}>
                <span>成员（{members.length}）</span>
                <span>头像上的绿点 = 当前在线</span>
              </div>
              <ul className="divide-y">
                {members.map((m) => {
                  const recentlyReminded =
                    m.last_reminded_at && nowMs - new Date(m.last_reminded_at).getTime() < REMIND_COOLDOWN_MS
                  const canRemind = m.has_goal && !m.done && !recentlyReminded
                  const online = onlineIds.has(m.user_id)
                  return (
                    <li key={m.user_id} className="flex items-start gap-3 px-4 py-3">
                      <span className="relative shrink-0">
                        <UserAvatar owner={avatarOwnerOf(m.user_id, profiles, m.nickname)} size="md" />
                        {online && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-card" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-medium">
                            {nickOf(m.user_id, profiles, m.nickname)}
                            {m.user_id === me && <span className="ml-1 text-xs text-muted-foreground">（我）</span>}
                          </span>
                          {m.is_owner && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">房主</span>}
                          <StatusChip m={m} />
                        </div>
                        <PublicBadges p={profiles[m.user_id]} />
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
                            title={`移出 ${nickOf(m.user_id, profiles, m.nickname)}`}
                            onClick={() => handleRemoveMember(openRoomId, m.user_id, nickOf(m.user_id, profiles, m.nickname))}
                          >
                            <UserMinus className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </Panel>
          </>
        )}

        {!detail && !detailError && (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
            <Spinner className="h-4 w-4" /> 加载打卡状态…
          </div>
        )}

        <CreateRoomDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} />
        <PublicProfileDialog open={profileOpen} onOpenChange={setProfileOpen} onSaved={bumpDetail} />
      </div>
    )
  }

  // ---------- 房间列表 ----------
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <UsersRound className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-semibold">自习室</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">拉上好友组个自习室，互相监督，完成每天的练习计划。</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => setProfileOpen(true)}>
            <UserRoundCog className="h-3.5 w-3.5" /> 我的公开资料
          </Button>
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
        <Panel>
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
        </Panel>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {rooms.map((r) => {
            const ids = roomMembers[r.id] ?? []
            const onlineCount = ids.filter((id) => onlineIds.has(id)).length
            return (
              <button key={r.id} type="button" onClick={() => openRoom(r.id)} className="group text-left">
                <Panel className="h-full transition-all duration-300 group-hover:-translate-y-1 group-hover:border-primary/40">
                  <div className={BAR}>
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <ClipboardList className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="truncate font-medium text-foreground">{r.name}</span>
                    </span>
                    <span className="shrink-0">{ids.length} 人</span>
                  </div>
                  <div className="space-y-3 p-4">
                    <p className="line-clamp-2 min-h-[2rem] text-xs text-muted-foreground">
                      {r.description || '这个自习室还没有写简介。'}
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <AvatarStack ids={ids} profiles={profiles} onlineIds={onlineIds} max={5} />
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        在线 {onlineCount}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-[11px] text-muted-foreground">
                      <span className="inline-flex min-w-0 items-center gap-1.5">
                        <UserAvatar owner={avatarOwnerOf(r.owner_id, profiles)} size="xs" />
                        <span className="truncate">房主 {nickOf(r.owner_id, profiles)}</span>
                      </span>
                      <span className="shrink-0">
                        邀请码 <code className="rounded bg-muted px-1.5 py-0.5 font-semibold tracking-widest">{r.invite_code}</code>
                      </span>
                    </div>
                  </div>
                </Panel>
              </button>
            )
          })}
        </div>
      )}

      <CreateRoomDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} />
      <JoinRoomDialog open={joinOpen} onOpenChange={setJoinOpen} onJoin={handleJoin} />
      <PublicProfileDialog open={profileOpen} onOpenChange={setProfileOpen} onSaved={bumpList} />
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

// ---------- 我的公开资料 ----------
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-lg border px-2.5 py-1 text-xs transition-colors cursor-pointer',
        active
          ? 'border-primary bg-primary/10 font-medium text-primary'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
      )}
    >
      {children}
    </button>
  )
}

function VisibilityRow({
  icon,
  label,
  hint,
  visible,
  onVisibleChange,
  children,
}: {
  icon: React.ReactNode
  label: string
  hint: string
  visible: boolean
  onVisibleChange: (v: boolean) => void
  children: React.ReactNode
}) {
  return (
    <div className={cn('rounded-xl border p-3 transition-colors', visible && 'border-primary/40 bg-primary/[0.03]')}>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium">
          <span className="text-primary">{icon}</span>
          {label}
        </span>
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
          <Switch checked={visible} onCheckedChange={onVisibleChange} />
          {visible ? '公开' : '不公开'}
        </label>
      </div>
      <div className="mt-2">{children}</div>
      <p className="mt-1.5 text-[10px] text-muted-foreground">{hint}</p>
    </div>
  )
}

function PublicProfileDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSaved: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onOpenChange(false) }}>
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
        {/* 每次打开重新挂载, 直接用当前 profile 做初值, 免去回填的 effect */}
        {open && <PublicProfileForm onClose={() => onOpenChange(false)} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  )
}

function PublicProfileForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { user, profile, refreshProfile } = useAuthStore()
  const [goalType, setGoalType] = useState(() => profile?.goal_type ?? '')
  const [examStatus, setExamStatus] = useState(() => profile?.exam_status ?? '')
  const [school, setSchool] = useState(() => profile?.target_school ?? '')
  const [visibility, setVisibility] = useState<ProfileVisibility>(() => parseVisibility(profile?.profile_visibility))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const setKey = (key: keyof ProfileVisibility, value: boolean) => {
    setVisibility((prev) => ({ ...prev, [key]: value }))
  }

  const save = async () => {
    if (!user) return
    setSaving(true)
    setErr('')
    try {
      await updateProfile(user.id, {
        goal_type: goalType || null,
        exam_status: examStatus || null,
        target_school: school.trim() || null,
        profile_visibility: serializeVisibility(visibility),
      })
    } catch (e) {
      logError('StudyRoomsPage.savePublicProfile', e)
      setSaving(false)
      setErr(userMessage(e))
      return
    }
    setSaving(false)
    await refreshProfile()
    onSaved()
    onClose()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>我的公开资料</DialogTitle>
        <DialogDescription>
          自习室里的同学只能看到你勾选「公开」的内容；没勾的一律不下发。
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <VisibilityRow
          icon={<Target className="h-3.5 w-3.5" />}
          label="备考目标"
          hint="和首页仪表盘的备考目标共用同一个设置。"
          visible={visibility.goal_type}
          onVisibleChange={(v) => setKey('goal_type', v)}
        >
          <div className="flex flex-wrap gap-1.5">
            {EXAM_GOALS.map((g) => (
              <Chip key={g.value} active={goalType === g.value} onClick={() => setGoalType(goalType === g.value ? '' : g.value)}>
                {g.label}
              </Chip>
            ))}
          </div>
        </VisibilityRow>

        <VisibilityRow
          icon={<Flame className="h-3.5 w-3.5" />}
          label="备考状态"
          hint="让同学知道你现在是在校、在职还是二战。"
          visible={visibility.exam_status}
          onVisibleChange={(v) => setKey('exam_status', v)}
        >
          <div className="flex flex-wrap gap-1.5">
            {EXAM_STATUSES.map((s) => (
              <Chip key={s.value} active={examStatus === s.value} onClick={() => setExamStatus(examStatus === s.value ? '' : s.value)}>
                {s.label}
              </Chip>
            ))}
          </div>
        </VisibilityRow>

        <VisibilityRow
          icon={<GraduationCap className="h-3.5 w-3.5" />}
          label="目标院校"
          hint="比如「XX大学 计算机」。"
          visible={visibility.target_school}
          onVisibleChange={(v) => setKey('target_school', v)}
        >
          <Input
            value={school}
            maxLength={40}
            placeholder="目标院校 / 专业"
            onChange={(e) => setSchool(e.target.value)}
          />
        </VisibilityRow>
      </div>

      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        昵称与头像始终对自习室成员可见，否则大家认不出谁是谁。
      </p>

      {err && <p className="text-xs text-destructive">{err}</p>}

      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
        <Button size="sm" disabled={saving} onClick={save}>
          {saving ? <Spinner className="h-3.5 w-3.5" /> : null}
          保存
        </Button>
      </DialogFooter>
    </>
  )
}
