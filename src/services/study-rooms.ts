import { AppError } from './errors'
import { db, fetchAll, fetchInChunks, runList, type QueryOptions } from './db'
import { assertColumns } from './columns'

/**
 * 自习室的数据访问层：study_rooms / study_room_members / study_room_reminders。
 *
 * 成员昵称、头像刻意不在这里查 —— profiles 有自己的服务与列集(还带可见性过滤)，
 * 调用方把取好的资料传进来，本模块只负责交出房间与成员行。
 */

/** 房间的列集。建房只能走 create_study_room（study_rooms 没有 INSERT 策略），所以同样的列集要够回显。 */
export type StudyRoomSource = {
  id: string
  owner_id: string
  name: string
  description: string
  invite_code: string
  created_at: string
}

export const STUDY_ROOM_COLUMNS = assertColumns<StudyRoomSource>()(
  'id, owner_id, name, description, invite_code, created_at',
)

export interface StudyRoom {
  id: string
  owner_id: string
  name: string
  description: string
  invite_code: string
  created_at: string
}

export function toStudyRoom(row: StudyRoomSource): StudyRoom {
  return {
    id: row.id,
    owner_id: row.owner_id,
    name: row.name,
    description: row.description,
    invite_code: row.invite_code,
    created_at: row.created_at,
  }
}

/** 成员行的列集。打卡状态、昵称由 study-room Edge Function 现算，不在这张表里。 */
export type StudyRoomMemberSource = {
  id: string
  room_id: string
  user_id: string
  joined_at: string
}

export const STUDY_ROOM_MEMBER_COLUMNS = assertColumns<StudyRoomMemberSource>()(
  'id, room_id, user_id, joined_at',
)

export interface StudyRoomMember {
  id: string
  room_id: string
  user_id: string
  joined_at: string
}

export function toStudyRoomMember(row: StudyRoomMemberSource): StudyRoomMember {
  return {
    id: row.id,
    room_id: row.room_id,
    user_id: row.user_id,
    joined_at: row.joined_at,
  }
}

/** 提醒记录的列集：只取冷却判断要用的两列，和 study-room Edge Function 的读法一致。 */
export type RoomReminderSource = {
  id: string
  room_id: string
  user_id: string
  reminded_at: string
}

export const ROOM_REMINDER_COLUMNS = assertColumns<Pick<RoomReminderSource, 'user_id' | 'reminded_at'>>()(
  'user_id, reminded_at',
)

export interface RoomReminder {
  user_id: string
  reminded_at: string
}

export function toRoomReminder(row: Pick<RoomReminderSource, 'user_id' | 'reminded_at'>): RoomReminder {
  return { user_id: row.user_id, reminded_at: row.reminded_at }
}

/** 删除要回一行来确认：DELETE 不带 select 时 PostgREST 什么都不回，分不清"删掉了"和"被 RLS 挡了" */
const DELETED_MEMBER_COLUMNS = assertColumns<Pick<StudyRoomMemberSource, 'user_id'>>()('user_id')

const DELETED_ROOM_COLUMNS = assertColumns<Pick<StudyRoomSource, 'id'>>()('id')

/**
 * 当前用户可见的房间（RLS 已限成房主 + 成员），按建房时间倒序，和列表页顺序一致。
 * 翻页要按 (created_at, id) 全序：只按 created_at 排，同一时刻建的房会在页边界漏掉或重复。
 */
export async function fetchStudyRooms(options: QueryOptions = {}): Promise<StudyRoom[]> {
  const rows = await fetchAll(
    (from, to) => {
      const base = db
        .from('study_rooms')
        .select(STUDY_ROOM_COLUMNS)
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to)
      return options.signal ? base.abortSignal(options.signal) : base
    },
    { ...options, context: options.context ?? 'studyRooms.fetchRooms' },
  )
  return rows.map(toStudyRoom)
}

/** 一批房间的成员，按加入时间升序（列表页的头像顺序就按它）。id 列表会切批，见 lib/chunk-ids.ts。 */
export async function fetchRoomMembers(roomIds: string[], options: QueryOptions = {}): Promise<StudyRoomMember[]> {
  const rows = await fetchInChunks(
    roomIds,
    (chunk) => {
      const base = db
        .from('study_room_members')
        .select(STUDY_ROOM_MEMBER_COLUMNS)
        .in('room_id', chunk)
        .order('joined_at')
      return options.signal ? base.abortSignal(options.signal) : base
    },
    { ...options, context: options.context ?? 'studyRooms.fetchRoomMembers' },
  )
  return rows.map(toStudyRoomMember)
}

/**
 * 房间的提醒记录，用于「刚提醒过」的冷却判断。
 *
 * 提醒是 study-room Edge Function 用 service_role 写进去的，这张表的 RLS 没有开任何策略，
 * 所以浏览器端查它只会拿到空数组 —— 页面上的「已提醒」仍然取自该函数的 last_reminded_at。
 */
export async function fetchRoomReminders(roomId: string, options: QueryOptions = {}): Promise<RoomReminder[]> {
  const base = db
    .from('study_room_reminders')
    .select(ROOM_REMINDER_COLUMNS)
    .eq('room_id', roomId)
    .order('reminded_at', { ascending: false })
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'studyRooms.fetchRoomReminders' },
  )
  return rows.map(toRoomReminder)
}

/**
 * 建房。邀请码在服务端生成（要保证 6 位唯一），房主自动成为成员，
 * 所以这里既不该也没法直接 insert study_rooms —— 只有这个函数能创建房间。
 */
export async function createStudyRoom(
  name: string,
  description: string,
  options: QueryOptions = {},
): Promise<StudyRoom> {
  const context = options.context ?? 'studyRooms.createRoom'
  const base = db.rpc('create_study_room', { p_name: name, p_description: description })
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context },
  )
  const row = rows[0]
  // 不标成 server：那个 kind 是可重试的，重试一次就是多建一个房间
  if (!row) throw new AppError({ kind: 'unknown', message: `${context}: 数据库没有返回新房间` })
  return toStudyRoom(row)
}

/** 凭邀请码加入。invite_code 不存在 / 已在房间里，由函数抛 invalid_code / already_member。 */
export async function joinStudyRoom(code: string, options: QueryOptions = {}): Promise<StudyRoomMember> {
  const context = options.context ?? 'studyRooms.joinRoom'
  const base = db.rpc('join_study_room', { p_code: code })
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context },
  )
  const row = rows[0]
  if (!row) throw new AppError({ kind: 'unknown', message: `${context}: 数据库没有返回成员行` })
  return toStudyRoomMember(row)
}

/**
 * 移出成员（自己退房也是这条）。被 RLS 挡下的 DELETE 不报错、只回 0 行，
 * 所以必须让 PostgREST 回出被删的行来确认 —— 否则页面会"提示成功，其实谁都没动"。
 */
export async function removeRoomMember(roomId: string, userId: string, options: QueryOptions = {}): Promise<void> {
  const context = options.context ?? 'studyRooms.removeRoomMember'
  const base = db
    .from('study_room_members')
    .delete()
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .select(DELETED_MEMBER_COLUMNS)
  const deleted = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context },
  )
  if (deleted.length === 0) {
    throw new AppError({ kind: 'not_found', message: `${context}: 没有删掉任何行（成员已不在房间，或当前用户无权移出）` })
  }
}

/** 解散房间。成员与提醒记录由外键 ON DELETE CASCADE 一起清掉，不在这里显式删。 */
export async function deleteStudyRoom(roomId: string, options: QueryOptions = {}): Promise<void> {
  const context = options.context ?? 'studyRooms.deleteRoom'
  const base = db.from('study_rooms').delete().eq('id', roomId).select(DELETED_ROOM_COLUMNS)
  const deleted = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context },
  )
  if (deleted.length === 0) {
    throw new AppError({ kind: 'not_found', message: `${context}: 没有删掉任何行（房间已不存在，或当前用户不是房主）` })
  }
}
