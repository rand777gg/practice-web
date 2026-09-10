/**
 * 专业专题搜索 DEMO 数据。
 * 给每门专业课补上「全国统考 / 自命题」属性、常见专业课代码，以及使用该科目的院校。
 * 院校与代码为示例数据，仅用于演示搜索维度，不代表真实招生信息。
 */

import { DEMO_TOPICS, type DemoTopic } from './topics-demo'

export type ExamType = '全国统考' | '自命题'

export interface TopicSchool {
  id: string
  name: string
  tier: '985' | '211' | '双一流' | '普通'
  city: string
  /** 该校这门课使用的科目代码 */
  subjectCode: string
  note: string
}

export interface TopicSearchEntry {
  topicId: string
  examType: ExamType
  /** 常见科目代码，用于按代码搜索 */
  codes: string[]
  /** 别名，方便按俗称搜索 */
  aliases: string[]
  schools: TopicSchool[]
}

export const TOPIC_SEARCH_ENTRIES: TopicSearchEntry[] = [
  {
    topicId: 'ds',
    examType: '全国统考',
    codes: ['408'],
    aliases: ['数据结构', 'DS', '统考计算机', '计算机学科专业基础综合'],
    schools: [
      { id: 'thu', name: '清华大学', tier: '985', city: '北京', subjectCode: '408', note: '计算机科学与技术系' },
      { id: 'pku', name: '北京大学', tier: '985', city: '北京', subjectCode: '408', note: '信息科学技术学院' },
      { id: 'zju', name: '浙江大学', tier: '985', city: '杭州', subjectCode: '408', note: '计算机科学与技术学院' },
      { id: 'sjtu', name: '上海交通大学', tier: '985', city: '上海', subjectCode: '408', note: '电子信息与电气工程学院' },
      { id: 'ustc', name: '中国科学技术大学', tier: '985', city: '合肥', subjectCode: '408', note: '计算机科学与技术学院' },
      { id: 'hust', name: '华中科技大学', tier: '985', city: '武汉', subjectCode: '408', note: '计算机科学与技术学院' },
      { id: 'hit', name: '哈尔滨工业大学', tier: '985', city: '哈尔滨', subjectCode: '408', note: '计算学部' },
      { id: 'buaa', name: '北京航空航天大学', tier: '985', city: '北京', subjectCode: '408', note: '计算机学院' },
    ],
  },
  {
    topicId: 'co',
    examType: '全国统考',
    codes: ['408'],
    aliases: ['组成原理', '计组', '计算机组成', 'CO'],
    schools: [
      { id: 'thu', name: '清华大学', tier: '985', city: '北京', subjectCode: '408', note: '计算机科学与技术系' },
      { id: 'pku', name: '北京大学', tier: '985', city: '北京', subjectCode: '408', note: '信息科学技术学院' },
      { id: 'zju', name: '浙江大学', tier: '985', city: '杭州', subjectCode: '408', note: '计算机科学与技术学院' },
      { id: 'sjtu', name: '上海交通大学', tier: '985', city: '上海', subjectCode: '408', note: '电子信息与电气工程学院' },
      { id: 'nju', name: '南京大学', tier: '985', city: '南京', subjectCode: '408', note: '计算机科学与技术系' },
      { id: 'hust', name: '华中科技大学', tier: '985', city: '武汉', subjectCode: '408', note: '计算机科学与技术学院' },
    ],
  },
  {
    topicId: 'os',
    examType: '全国统考',
    codes: ['408'],
    aliases: ['操作系统', 'OS', '进程管理', '内存管理'],
    schools: [
      { id: 'thu', name: '清华大学', tier: '985', city: '北京', subjectCode: '408', note: '计算机科学与技术系' },
      { id: 'zju', name: '浙江大学', tier: '985', city: '杭州', subjectCode: '408', note: '计算机科学与技术学院' },
      { id: 'sjtu', name: '上海交通大学', tier: '985', city: '上海', subjectCode: '408', note: '电子信息与电气工程学院' },
      { id: 'ustc', name: '中国科学技术大学', tier: '985', city: '合肥', subjectCode: '408', note: '计算机科学与技术学院' },
      { id: 'hit', name: '哈尔滨工业大学', tier: '985', city: '哈尔滨', subjectCode: '408', note: '计算学部' },
      { id: 'tongji', name: '同济大学', tier: '985', city: '上海', subjectCode: '408', note: '电子与信息工程学院' },
    ],
  },
  {
    topicId: 'cn',
    examType: '全国统考',
    codes: ['408'],
    aliases: ['计算机网络', '计网', 'CN', '网络'],
    schools: [
      { id: 'thu', name: '清华大学', tier: '985', city: '北京', subjectCode: '408', note: '计算机科学与技术系' },
      { id: 'buaa', name: '北京航空航天大学', tier: '985', city: '北京', subjectCode: '408', note: '计算机学院' },
      { id: 'zju', name: '浙江大学', tier: '985', city: '杭州', subjectCode: '408', note: '计算机科学与技术学院' },
      { id: 'bupt', name: '北京邮电大学', tier: '211', city: '北京', subjectCode: '408', note: '计算机学院（网络方向）' },
      { id: 'seu', name: '东南大学', tier: '985', city: '南京', subjectCode: '408', note: '计算机科学与工程学院' },
      { id: 'nankai', name: '南开大学', tier: '985', city: '天津', subjectCode: '408', note: '计算机学院' },
    ],
  },
  {
    topicId: 'db',
    examType: '自命题',
    codes: ['856', '912', '853', '901'],
    aliases: ['数据库', 'DB', '数据库系统', '关系数据库'],
    schools: [
      { id: 'ruc', name: '中国人民大学', tier: '985', city: '北京', subjectCode: '856', note: '信息学院 · 数据库与信息系统' },
      { id: 'bupt', name: '北京邮电大学', tier: '211', city: '北京', subjectCode: '912', note: '计算机学院（自命题）' },
      { id: 'xidian', name: '西安电子科技大学', tier: '211', city: '西安', subjectCode: '853', note: '计算机科学与技术学院' },
      { id: 'csu', name: '中南大学', tier: '985', city: '长沙', subjectCode: '901', note: '计算机学院' },
      { id: 'hdu', name: '杭州电子科技大学', tier: '双一流', city: '杭州', subjectCode: '853', note: '计算机学院' },
    ],
  },
  {
    topicId: 'cc',
    examType: '自命题',
    codes: ['941', '903', '866', '906'],
    aliases: ['编译原理', 'CC', '编译器', '语法分析'],
    schools: [
      { id: 'buaa', name: '北京航空航天大学', tier: '985', city: '北京', subjectCode: '941', note: '计算机学院（自命题）' },
      { id: 'sysu', name: '中山大学', tier: '985', city: '广州', subjectCode: '903', note: '计算机学院' },
      { id: 'seu', name: '东南大学', tier: '985', city: '南京', subjectCode: '866', note: '计算机科学与工程学院' },
      { id: 'xjtu', name: '西安交通大学', tier: '985', city: '西安', subjectCode: '906', note: '电子与信息学部' },
      { id: 'hnu', name: '湖南大学', tier: '985', city: '长沙', subjectCode: '866', note: '信息科学与工程学院' },
    ],
  },
]

export type SearchDimension = 'all' | 'school' | 'code' | 'name'

export const SEARCH_DIMENSIONS: { key: SearchDimension; label: string; hint: string }[] = [
  { key: 'all', label: '全部维度', hint: '学校 / 代码 / 名称 / 考试形式' },
  { key: 'school', label: '学校', hint: '例如「浙江大学」「北京」' },
  { key: 'code', label: '专业课代码', hint: '例如「408」「912」' },
  { key: 'name', label: '专业课名称', hint: '例如「操作系统」「数据库」' },
]

export const EXAM_TYPES: (ExamType | '全部')[] = ['全部', '全国统考', '自命题']

export interface TopicSearchHit {
  topic: DemoTopic
  examType: ExamType
  /** 命中的说明，用于在结果里解释为什么搜到它 */
  reasons: string[]
  matchedSchools: TopicSchool[]
}

export interface TopicSearchOptions {
  query: string
  dimension: SearchDimension
  examType: ExamType | '全部'
  /** 只保留还有空余名额的（这里复用热度排序，不做额外过滤） */
  onlyUnified?: boolean
}

function schoolMatches(school: TopicSchool, keyword: string): boolean {
  return (
    school.name.toLowerCase().includes(keyword) ||
    school.city.toLowerCase().includes(keyword) ||
    school.subjectCode.toLowerCase().includes(keyword) ||
    school.note.toLowerCase().includes(keyword)
  )
}

export function searchTopics(options: TopicSearchOptions): TopicSearchHit[] {
  const keyword = options.query.trim().toLowerCase()
  const hits: TopicSearchHit[] = []

  for (const entry of TOPIC_SEARCH_ENTRIES) {
    const topic = DEMO_TOPICS.find((item) => item.id === entry.topicId)
    if (!topic) continue
    if (options.examType !== '全部' && entry.examType !== options.examType) continue

    const reasons: string[] = []
    const matchedSchools: TopicSchool[] = []

    const nameHit =
      options.dimension === 'all' || options.dimension === 'name'
        ? topic.name.toLowerCase().includes(keyword) ||
          topic.short.toLowerCase() === keyword ||
          entry.aliases.some((alias) => alias.toLowerCase().includes(keyword))
        : false
    if (nameHit) reasons.push(`专业课名称命中「${topic.name}」`)

    const codeHit =
      options.dimension === 'all' || options.dimension === 'code'
        ? topic.code.toLowerCase().includes(keyword) ||
          entry.codes.some((code) => code.toLowerCase().includes(keyword))
        : false
    if (codeHit) {
      const matchedCodes = entry.codes.filter((code) => code.toLowerCase().includes(keyword))
      const display = matchedCodes.length > 0 ? matchedCodes : [topic.code]
      reasons.push(`专业课代码命中「${display.join(' / ')}」`)
    }

    // 考试形式的原因放在院校之前，避免「自命题」这类搜索被院校备注命中而解释不清
    const examHit =
      options.dimension === 'all'
        ? entry.examType.toLowerCase().includes(keyword) || keyword === topic.code.toLowerCase()
        : false
    if (examHit && !nameHit && !codeHit) reasons.push(`考试形式命中「${entry.examType}」`)

    if (options.dimension === 'all' || options.dimension === 'school') {
      for (const school of entry.schools) {
        if (schoolMatches(school, keyword)) matchedSchools.push(school)
      }
      if (matchedSchools.length > 0) {
        reasons.push(`${matchedSchools.length} 所院校命中，如「${matchedSchools[0].name}」`)
      }
    }

    if (!keyword) {
      // 空关键词时按院校数量展示全部，方便浏览
      hits.push({ topic, examType: entry.examType, reasons: [`${entry.schools.length} 所院校在考`], matchedSchools: entry.schools })
      continue
    }
    if (reasons.length > 0) {
      hits.push({ topic, examType: entry.examType, reasons, matchedSchools })
    }
  }

  // 命中院校多的排前面，其次是专业课热度
  return hits.sort((a, b) => {
    const schoolDelta = b.matchedSchools.length - a.matchedSchools.length
    if (schoolDelta !== 0) return schoolDelta
    return b.topic.popularity - a.topic.popularity
  })
}

export function examTypeOf(topicId: string): ExamType {
  return TOPIC_SEARCH_ENTRIES.find((entry) => entry.topicId === topicId)?.examType ?? '全国统考'
}

export function codesOf(topicId: string): string[] {
  return TOPIC_SEARCH_ENTRIES.find((entry) => entry.topicId === topicId)?.codes ?? []
}

export function schoolsOf(topicId: string): TopicSchool[] {
  return TOPIC_SEARCH_ENTRIES.find((entry) => entry.topicId === topicId)?.schools ?? []
}
