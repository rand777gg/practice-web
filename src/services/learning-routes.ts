import type { Json } from '@/types/database'
import type { LearningRoute, RouteNodeStyle, RouteStage } from '@/types/learning-routes'
import {
  db, run, runList, fetchAll, fetchInChunks, toJson,
  type Insert, type QueryOptions, type Update,
} from './db'
import { assertColumns } from './columns'
import { AppError } from './errors'

/**
 * 三张路线表的字段集。
 *
 * 与 profiles 同理：列集字符串和 mapper 是分开写的，两者必然漂移 —— 少一列不会报错，
 * 只会在某个页面上读到 undefined。这里每个集合都由 assertColumns 在编译期核对
 * 「mapper 要读的字段是否都在这段字符串里」，新增列必须显式加进对应集合。
 */

export type LearningRouteSource = {
  id: string
  title: string
  description: string
  is_published: boolean
  route_order: number
  diagram_xml: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export const LEARNING_ROUTE_COLUMNS = assertColumns<LearningRouteSource>()(
  'id, title, description, is_published, route_order, diagram_xml, created_by, created_at, updated_at',
)

const LEARNING_ROUTE_ID_COLUMNS = assertColumns<Pick<LearningRouteSource, 'id'>>()('id')

const LEARNING_ROUTE_ORDER_COLUMNS = assertColumns<Pick<LearningRouteSource, 'route_order'>>()('route_order')

export type LearningRouteStageSource = {
  id: string
  route_id: string
  position: number
  title: string
  description: string
  node_style: Json
  created_at: string
}

export const LEARNING_ROUTE_STAGE_COLUMNS = assertColumns<LearningRouteStageSource>()(
  'id, route_id, position, title, description, node_style, created_at',
)

export type LearningRouteQuestionSource = {
  id: string
  stage_id: string
  question_id: string
  position: number
  node_style: Json
}

export const LEARNING_ROUTE_QUESTION_COLUMNS = assertColumns<LearningRouteQuestionSource>()(
  'id, stage_id, question_id, position, node_style',
)

/** 列表页只统计阶段/题数，不取阶段内容与样式 */
export type RouteStageRef = Pick<LearningRouteStageSource, 'id' | 'route_id'>

const LEARNING_ROUTE_STAGE_REF_COLUMNS = assertColumns<RouteStageRef>()('id, route_id')

/** 列表页按 question_id 去重计数，不需要关联行 id 与样式 */
export type RouteQuestionRef = Pick<LearningRouteQuestionSource, 'stage_id' | 'question_id'>

const LEARNING_ROUTE_QUESTION_REF_COLUMNS = assertColumns<RouteQuestionRef>()('stage_id, question_id')

const LEARNING_ROUTE_STAGE_ID_COLUMNS = assertColumns<Pick<LearningRouteStageSource, 'id'>>()('id')

const LEARNING_ROUTE_STAGE_POSITION_COLUMNS = assertColumns<Pick<LearningRouteStageSource, 'position'>>()('position')

const LEARNING_ROUTE_QUESTION_POSITION_COLUMNS = assertColumns<Pick<LearningRouteQuestionSource, 'position'>>()('position')

/** 阶段里的一「位」：learning_route_questions 的一行，node_style 已归一化 */
export interface RouteQuestionItem {
  id: string
  stage_id: string
  question_id: string
  position: number
  node_style: RouteNodeStyle
}

export type LearningRouteInput = {
  title: string
  description?: string
  is_published?: boolean
  route_order?: number
  created_by?: string | null
}

export type LearningRoutePatch = {
  title?: string
  description?: string
  is_published?: boolean
  route_order?: number
  diagram_xml?: string | null
}

export type RouteStageInput = {
  title: string
  description?: string
  node_style?: RouteNodeStyle
}

export type RouteStagePatch = {
  title?: string
  description?: string
  position?: number
  node_style?: RouteNodeStyle
}

export type RouteQuestionItemPatch = {
  position?: number
  node_style?: RouteNodeStyle
}

/** jsonb 列在类型上只是 Json，历史行里非对象的值（空串、数组）一律当「没设过样式」 */
function readNodeStyle(value: Json): RouteNodeStyle {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as RouteNodeStyle) : {}
}

/** DB 行 → 领域对象。JSONB 在这里归一化，UI 层不再各写一遍 parse。 */
export function toLearningRoute(row: LearningRouteSource): LearningRoute {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    is_published: row.is_published,
    route_order: row.route_order,
    diagram_xml: row.diagram_xml,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export function toRouteStage(row: LearningRouteStageSource): RouteStage {
  return {
    id: row.id,
    route_id: row.route_id,
    position: row.position,
    title: row.title,
    description: row.description,
    created_at: row.created_at,
    node_style: readNodeStyle(row.node_style),
  }
}

export function toRouteQuestionItem(row: LearningRouteQuestionSource): RouteQuestionItem {
  return {
    id: row.id,
    stage_id: row.stage_id,
    question_id: row.question_id,
    position: row.position,
    node_style: readNodeStyle(row.node_style),
  }
}

// ---------------------------------------------------------------------------
// learning_routes
// ---------------------------------------------------------------------------

/**
 * 路线列表。草稿模式（includeDrafts）下没有任何行过滤，是整表扫描，
 * 所以走 fetchAll 翻页 —— 路线条数会一直长，PostgREST 单次只回 1000 行且不报错。
 */
export async function listLearningRoutes(
  options: QueryOptions & { includeDrafts?: boolean } = {},
): Promise<LearningRoute[]> {
  const { includeDrafts = false, ...rest } = options
  const rows = await fetchAll(
    (from, to) => {
      let query = db.from('learning_routes').select(LEARNING_ROUTE_COLUMNS)
      if (!includeDrafts) query = query.eq('is_published', true)
      const base = query
        .order('route_order', { ascending: true })
        .order('created_at', { ascending: false })
        .range(from, to)
      return rest.signal ? base.abortSignal(rest.signal) : base
    },
    { ...rest, context: rest.context ?? 'learningRoutes.list' },
  )
  return rows.map(toLearningRoute)
}

/** 取单条路线。查不到返回 null（新路由刚跳转过去时也可能还没提交完），由调用方决定怎么提示。 */
export async function fetchLearningRoute(routeId: string, options: QueryOptions = {}): Promise<LearningRoute | null> {
  const base = db.from('learning_routes').select(LEARNING_ROUTE_COLUMNS).eq('id', routeId)
  const row = await run(
    () => (options.signal ? base.abortSignal(options.signal) : base).maybeSingle(),
    { ...options, context: options.context ?? 'learningRoutes.fetch' },
  )
  return row ? toLearningRoute(row) : null
}

/** 新建路线的排序位：当前最大 route_order，表为空时返回 null 让调用方决定起点 */
export async function fetchMaxRouteOrder(options: QueryOptions = {}): Promise<number | null> {
  const base = db
    .from('learning_routes')
    .select(LEARNING_ROUTE_ORDER_COLUMNS)
    .order('route_order', { ascending: false })
    .limit(1)
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'learningRoutes.maxOrder' },
  )
  return rows.length > 0 ? rows[0].route_order : null
}

export async function createLearningRoute(input: LearningRouteInput, options: QueryOptions = {}): Promise<string> {
  const base = db
    .from('learning_routes')
    .insert({
      title: input.title.trim(),
      description: (input.description ?? '').trim(),
      is_published: input.is_published ?? false,
      route_order: input.route_order ?? 0,
      created_by: input.created_by ?? null,
    })
    .select(LEARNING_ROUTE_ID_COLUMNS)
  const row = await run(
    () => (options.signal ? base.abortSignal(options.signal) : base).single(),
    { ...options, context: options.context ?? 'learningRoutes.create' },
  )
  if (!row) throw new AppError({ kind: 'not_found', message: 'learningRoutes.create: 插入后没拿到 id' })
  return row.id
}

/** updated_at 由服务层统一刷新，调用方不必各自 new Date()。 */
export async function updateLearningRoute(
  routeId: string,
  patch: LearningRoutePatch,
  options: QueryOptions = {},
): Promise<void> {
  const next: Update<'learning_routes'> = { updated_at: new Date().toISOString() }
  if (patch.title !== undefined) next.title = patch.title.trim()
  if (patch.description !== undefined) next.description = patch.description.trim()
  if (patch.is_published !== undefined) next.is_published = patch.is_published
  if (patch.route_order !== undefined) next.route_order = patch.route_order
  if (patch.diagram_xml !== undefined) next.diagram_xml = patch.diagram_xml
  const base = db.from('learning_routes').update(next).eq('id', routeId)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'learningRoutes.update' },
  )
}

/** 单独写 draw.io 路线图：编辑器里「保存图」和整体保存都会走这里 */
export async function saveLearningRouteDiagram(
  routeId: string,
  diagramXml: string | null,
  options: QueryOptions = {},
): Promise<void> {
  await updateLearningRoute(routeId, { diagram_xml: diagramXml }, {
    ...options,
    context: options.context ?? 'learningRoutes.saveDiagram',
  })
}

export async function deleteLearningRoute(routeId: string, options: QueryOptions = {}): Promise<void> {
  const base = db.from('learning_routes').delete().eq('id', routeId)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'learningRoutes.delete' },
  )
}

// ---------------------------------------------------------------------------
// learning_route_stages
// ---------------------------------------------------------------------------

/** 某条路线的全部阶段，按 position 升序 */
export async function listRouteStages(routeId: string, options: QueryOptions = {}): Promise<RouteStage[]> {
  const base = db
    .from('learning_route_stages')
    .select(LEARNING_ROUTE_STAGE_COLUMNS)
    .eq('route_id', routeId)
    .order('position', { ascending: true })
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'learningRoutes.listStages' },
  )
  return rows.map(toRouteStage)
}

/** 只要各阶段的归属，供列表页数阶段数、把题目数归到路线头上 */
export async function listRouteStageRefs(routeIds: string[], options: QueryOptions = {}): Promise<RouteStageRef[]> {
  return fetchInChunks(
    routeIds,
    (chunk) => {
      const base = db.from('learning_route_stages').select(LEARNING_ROUTE_STAGE_REF_COLUMNS).in('route_id', chunk)
      return options.signal ? base.abortSignal(options.signal) : base
    },
    { ...options, context: options.context ?? 'learningRoutes.listStageRefs' },
  )
}

/**
 * 追加阶段时用的下一个 position。
 * 读最大值再插入不是原子的：两个管理员同时加阶段会算出同一个值，
 * 撞上 UNIQUE(route_id, position) 后写的那条会失败（现状如此，暂无迁移计划）。
 */
async function nextStagePosition(routeId: string, options: QueryOptions = {}): Promise<number> {
  const base = db
    .from('learning_route_stages')
    .select(LEARNING_ROUTE_STAGE_POSITION_COLUMNS)
    .eq('route_id', routeId)
    .order('position', { ascending: false })
    .limit(1)
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'learningRoutes.nextStagePosition' },
  )
  return (rows.length > 0 ? rows[0].position : -1) + 1
}

export async function createRouteStage(
  routeId: string,
  stage: RouteStageInput,
  options: QueryOptions = {},
): Promise<string> {
  const position = await nextStagePosition(routeId, options)
  const base = db
    .from('learning_route_stages')
    .insert({
      route_id: routeId,
      position,
      title: stage.title.trim(),
      description: (stage.description ?? '').trim(),
      node_style: toJson(stage.node_style ?? {}),
    })
    .select(LEARNING_ROUTE_STAGE_ID_COLUMNS)
  const row = await run(
    () => (options.signal ? base.abortSignal(options.signal) : base).single(),
    { ...options, context: options.context ?? 'learningRoutes.createStage' },
  )
  if (!row) throw new AppError({ kind: 'not_found', message: 'learningRoutes.createStage: 插入后没拿到 id' })
  return row.id
}

export async function updateRouteStage(
  stageId: string,
  patch: RouteStagePatch,
  options: QueryOptions = {},
): Promise<void> {
  const next: Update<'learning_route_stages'> = {}
  if (patch.title !== undefined) next.title = patch.title.trim()
  if (patch.description !== undefined) next.description = patch.description.trim()
  if (patch.position !== undefined) next.position = patch.position
  if (patch.node_style !== undefined) next.node_style = toJson(patch.node_style)
  const base = db.from('learning_route_stages').update(next).eq('id', stageId)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'learningRoutes.updateStage' },
  )
}

export async function deleteRouteStage(stageId: string, options: QueryOptions = {}): Promise<void> {
  const base = db.from('learning_route_stages').delete().eq('id', stageId)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'learningRoutes.deleteStage' },
  )
}

/**
 * 两段式重排：先把所有受影响的行挪到负数区间，再写目标位置。
 *
 * 为什么不能直接按目标位置逐行写：两表都有 UNIQUE(route_id/stage_id, position)，
 * 而 Postgres 的唯一约束默认是按语句检查的（不是 DEFERRABLE）。把第 1 位移到第 2 位时第 2 位
 * 还占着，直接撞约束 —— 也就是说"交换相邻两项"这个最常见的操作本来就必然失败，
 * 旧代码把返回的 error 丢掉了，所以界面上看起来"拖了但顺序没变"。
 *
 * 负数区间与目标区间（0..n-1）不相交，两段之间不会互相冲突。中途失败会留下负 position
 * 的中间态：重新调用一次即可修好（第一段会把它们再挪一遍）。这比静默半新半旧可接受得多。
 */
const TEMP_POSITION_BASE = -1_000_000

async function reorderPositions(
  ids: string[],
  setPosition: (id: string, position: number) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < ids.length; i++) await setPosition(ids[i], TEMP_POSITION_BASE - i)
  for (let i = 0; i < ids.length; i++) await setPosition(ids[i], i)
}

/**
 * 把「要排在前面的 id」与「该父级下其余的 id」拼成一份完整顺序。
 *
 * 为什么要拼：route editor 会在同一次保存里先 insert 再重排，而刚插入的行还没进它的
 * working 状态，于是传进来的只是部分列表。只重排这部分的话，第二段会去占 0..n-1，
 * 而没列出的行正占着这些位置 —— 又是唯一约束冲突。旧代码这里同样失败，只是错误被吞了。
 * 未列出的行按它们原本次序接在后面，与"新加的排在最后"这一既有结果一致。
 */
function mergeOrder(preferred: string[], existingOrderedIds: string[]): string[] {
  const listed = new Set(preferred)
  return [...preferred, ...existingOrderedIds.filter((id) => !listed.has(id))]
}

/** 按传入的 id 顺序覆盖 position（两段式 + 补齐未列出的行，见上面两个注释） */
export async function reorderRouteStages(
  routeId: string,
  orderedStageIds: string[],
  options: QueryOptions = {},
): Promise<void> {
  const existing = await listRouteStages(routeId, options)
  const finalOrder = mergeOrder(orderedStageIds, existing.map((s) => s.id))
  await reorderPositions(finalOrder, async (id, position) => {
    const base = db
      .from('learning_route_stages')
      .update({ position })
      .eq('route_id', routeId)
      .eq('id', id)
    await run(
      () => (options.signal ? base.abortSignal(options.signal) : base),
      { ...options, context: options.context ?? 'learningRoutes.reorderStages' },
    )
  })
}

// ---------------------------------------------------------------------------
// learning_route_questions
// ---------------------------------------------------------------------------

/** 某阶段里有序的题目关联行。列表页要按阶段拼题目树，所以按阶段一条条读。 */
export async function listStageQuestionItems(
  stageId: string,
  options: QueryOptions = {},
): Promise<RouteQuestionItem[]> {
  const base = db
    .from('learning_route_questions')
    .select(LEARNING_ROUTE_QUESTION_COLUMNS)
    .eq('stage_id', stageId)
    .order('position', { ascending: true })
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'learningRoutes.listStageQuestionItems' },
  )
  return rows.map(toRouteQuestionItem)
}

/** 编辑器一次要拿整条路线所有阶段的关联行（包括刚建的阶段） */
export async function listQuestionItemsByStages(
  stageIds: string[],
  options: QueryOptions = {},
): Promise<RouteQuestionItem[]> {
  const rows = await fetchInChunks(
    stageIds,
    (chunk) => {
      const base = db
        .from('learning_route_questions')
        .select(LEARNING_ROUTE_QUESTION_COLUMNS)
        .in('stage_id', chunk)
        .order('position', { ascending: true })
      return options.signal ? base.abortSignal(options.signal) : base
    },
    { ...options, context: options.context ?? 'learningRoutes.listQuestionItemsByStages' },
  )
  return rows.map(toRouteQuestionItem)
}

/** 只要 stage_id → question_id，供列表页算每阶段/每条路线的题数 */
export async function listQuestionRefsByStages(
  stageIds: string[],
  options: QueryOptions = {},
): Promise<RouteQuestionRef[]> {
  return fetchInChunks(
    stageIds,
    (chunk) => {
      const base = db.from('learning_route_questions').select(LEARNING_ROUTE_QUESTION_REF_COLUMNS).in('stage_id', chunk)
      return options.signal ? base.abortSignal(options.signal) : base
    },
    { ...options, context: options.context ?? 'learningRoutes.listQuestionRefsByStages' },
  )
}

/** 追加题目时用的下一个 position，写库前一次性算好（同样不是原子读） */
async function nextQuestionPosition(stageId: string, options: QueryOptions = {}): Promise<number> {
  const base = db
    .from('learning_route_questions')
    .select(LEARNING_ROUTE_QUESTION_POSITION_COLUMNS)
    .eq('stage_id', stageId)
    .order('position', { ascending: false })
    .limit(1)
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'learningRoutes.nextQuestionPosition' },
  )
  return (rows.length > 0 ? rows[0].position : -1) + 1
}

/** 往阶段末尾追加题目；nodeStyleByQid 缺省表示这些题都用默认样式 */
export async function addRouteQuestions(
  stageId: string,
  questionIds: string[],
  nodeStyleByQid: Record<string, RouteNodeStyle> = {},
  options: QueryOptions = {},
): Promise<void> {
  if (questionIds.length === 0) return
  let position = await nextQuestionPosition(stageId, options)
  const rows: Insert<'learning_route_questions'>[] = questionIds.map((questionId) => ({
    stage_id: stageId,
    question_id: questionId,
    position: position++,
    node_style: toJson(nodeStyleByQid[questionId] ?? {}),
  }))
  const base = db.from('learning_route_questions').insert(rows)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'learningRoutes.addQuestions' },
  )
}

export async function updateRouteQuestionItem(
  itemId: string,
  patch: RouteQuestionItemPatch,
  options: QueryOptions = {},
): Promise<void> {
  const next: Update<'learning_route_questions'> = {}
  if (patch.position !== undefined) next.position = patch.position
  if (patch.node_style !== undefined) next.node_style = toJson(patch.node_style)
  const base = db.from('learning_route_questions').update(next).eq('id', itemId)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'learningRoutes.updateQuestionItem' },
  )
}

/** 把一道题从阶段里移除（只删关联行，不动 questions） */
export async function removeRouteQuestion(itemId: string, options: QueryOptions = {}): Promise<void> {
  const base = db.from('learning_route_questions').delete().eq('id', itemId)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'learningRoutes.removeQuestion' },
  )
}

/** 与 reorderRouteStages 同样的限制：逐行 update，非事务，且会撞 UNIQUE(stage_id, position) */
export async function reorderRouteQuestions(
  stageId: string,
  orderedItemIds: string[],
  options: QueryOptions = {},
): Promise<void> {
  const existing = await listStageQuestionItems(stageId, options)
  const finalOrder = mergeOrder(orderedItemIds, existing.map((it) => it.id))
  await reorderPositions(finalOrder, async (id, position) => {
    const base = db
      .from('learning_route_questions')
      .update({ position })
      .eq('stage_id', stageId)
      .eq('id', id)
    await run(
      () => (options.signal ? base.abortSignal(options.signal) : base),
      { ...options, context: options.context ?? 'learningRoutes.reorderQuestions' },
    )
  })
}
