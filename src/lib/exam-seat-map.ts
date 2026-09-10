/**
 * 组织考试（座位图）DEMO 数据与工具。
 * 当前仅做前端可视化演示：考试场次、考生、座位均为本地 mock，不接数据库。
 * 后续接入真实数据时，把这里的类型与数据源替换为 supabase 查询即可。
 */

export type SeatStatus = 'present' | 'late' | 'absent'

export interface CandidateSeat {
  /** 座位号，如 "A-03" */
  seatNo: string
  /** 列下标（从左到右，0 起） */
  col: number
  /** 行下标（从前往后，0 起） */
  row: number
  name: string
  studentId: string
  status: SeatStatus
  /** 是否已交卷 */
  submitted: boolean
  /** 交卷 / 到场时刻（演示文案） */
  time?: string
}

export interface ExamVenue {
  id: string
  name: string
  subject: string
  startTime: string
  durationMin: number
  /** 座位总行数 */
  rows: number
  /** 每行座位列数（不含过道） */
  cols: number
  /** 过道列下标（从 0 起，通常放中间），-1 表示无过道 */
  aisleCol: number
  seats: CandidateSeat[]
}

export const MOCK_EXAMS: ExamVenue[] = [
  {
    id: 'exam-2025-408-1',
    name: '2025 计算机学科专业基础综合（408）模考',
    subject: '408 计算机学科专业基础',
    startTime: '2026-09-13 09:00',
    durationMin: 180,
    rows: 6,
    cols: 7,
    aisleCol: 3,
    seats: [
      { seatNo: 'A-01', col: 0, row: 0, name: '张伟', studentId: '2024001', status: 'present', submitted: true, time: '10:52' },
      { seatNo: 'A-02', col: 1, row: 0, name: '李娜', studentId: '2024002', status: 'present', submitted: false },
      { seatNo: 'A-03', col: 2, row: 0, name: '王强', studentId: '2024003', status: 'late', submitted: false, time: '09:14' },
      { seatNo: 'A-04', col: 4, row: 0, name: '刘洋', studentId: '2024004', status: 'present', submitted: false },
      { seatNo: 'A-05', col: 5, row: 0, name: '陈静', studentId: '2024005', status: 'present', submitted: true, time: '11:03' },
      { seatNo: 'A-06', col: 6, row: 0, name: '杨帆', studentId: '2024006', status: 'absent', submitted: false },
      { seatNo: 'B-01', col: 0, row: 1, name: '赵敏', studentId: '2024007', status: 'present', submitted: false },
      { seatNo: 'B-02', col: 1, row: 1, name: '孙磊', studentId: '2024008', status: 'present', submitted: false },
      { seatNo: 'B-03', col: 2, row: 1, name: '周杰', studentId: '2024009', status: 'present', submitted: true, time: '10:40' },
      { seatNo: 'B-04', col: 4, row: 1, name: '吴婷', studentId: '2024010', status: 'late', submitted: false, time: '09:08' },
      { seatNo: 'B-05', col: 5, row: 1, name: '郑浩', studentId: '2024011', status: 'present', submitted: false },
      { seatNo: 'B-06', col: 6, row: 1, name: '冯雪', studentId: '2024012', status: 'present', submitted: true, time: '11:20' },
      { seatNo: 'C-01', col: 0, row: 2, name: '褚明', studentId: '2024013', status: 'present', submitted: false },
      { seatNo: 'C-02', col: 1, row: 2, name: '卫华', studentId: '2024014', status: 'absent', submitted: false },
      { seatNo: 'C-03', col: 2, row: 2, name: '蒋丽', studentId: '2024015', status: 'present', submitted: false },
      { seatNo: 'C-04', col: 4, row: 2, name: '沈涛', studentId: '2024016', status: 'present', submitted: true, time: '10:55' },
      { seatNo: 'C-05', col: 5, row: 2, name: '韩梅', studentId: '2024017', status: 'present', submitted: false },
      { seatNo: 'C-06', col: 6, row: 2, name: '杨光', studentId: '2024018', status: 'late', submitted: false, time: '09:22' },
      { seatNo: 'D-01', col: 0, row: 3, name: '朱琳', studentId: '2024019', status: 'present', submitted: false },
      { seatNo: 'D-02', col: 1, row: 3, name: '秦飞', studentId: '2024020', status: 'present', submitted: true, time: '10:58' },
      { seatNo: 'D-03', col: 2, row: 3, name: '尤娜', studentId: '2024021', status: 'present', submitted: false },
      { seatNo: 'D-04', col: 4, row: 3, name: '许磊', studentId: '2024022', status: 'present', submitted: false },
      { seatNo: 'D-05', col: 5, row: 3, name: '何静', studentId: '2024023', status: 'absent', submitted: false },
      { seatNo: 'D-06', col: 6, row: 3, name: '吕峰', studentId: '2024024', status: 'present', submitted: false },
      { seatNo: 'E-01', col: 0, row: 4, name: '施颖', studentId: '2024025', status: 'present', submitted: false },
      { seatNo: 'E-02', col: 1, row: 4, name: '张帆', studentId: '2024026', status: 'present', submitted: true, time: '10:48' },
      { seatNo: 'E-03', col: 2, row: 4, name: '孔明', studentId: '2024027', status: 'present', submitted: false },
      { seatNo: 'E-04', col: 4, row: 4, name: '曹阳', studentId: '2024028', status: 'late', submitted: false, time: '09:35' },
      { seatNo: 'E-05', col: 5, row: 4, name: '严芳', studentId: '2024029', status: 'present', submitted: false },
      { seatNo: 'E-06', col: 6, row: 4, name: '华子', studentId: '2024030', status: 'present', submitted: false },
      { seatNo: 'F-01', col: 0, row: 5, name: '金辉', studentId: '2024031', status: 'present', submitted: false },
      { seatNo: 'F-02', col: 1, row: 5, name: '魏然', studentId: '2024032', status: 'present', submitted: true, time: '11:11' },
      { seatNo: 'F-03', col: 2, row: 5, name: '陶然', studentId: '2024033', status: 'absent', submitted: false },
      { seatNo: 'F-04', col: 4, row: 5, name: '姜维', studentId: '2024034', status: 'present', submitted: false },
      { seatNo: 'F-05', col: 5, row: 5, name: '范雨', studentId: '2024035', status: 'present', submitted: false },
      { seatNo: 'F-06', col: 6, row: 5, name: '彭飞', studentId: '2024036', status: 'late', submitted: false, time: '09:41' },
    ],
  },
  {
    id: 'exam-math-2',
    name: '2026 考研数学（一）冲刺卷',
    subject: '数学（一）',
    startTime: '2026-09-20 14:00',
    durationMin: 180,
    rows: 5,
    cols: 6,
    aisleCol: -1,
    seats: [
      { seatNo: 'A-01', col: 0, row: 0, name: '周杰', studentId: '2024009', status: 'present', submitted: false },
      { seatNo: 'A-02', col: 1, row: 0, name: '吴婷', studentId: '2024010', status: 'present', submitted: false },
      { seatNo: 'A-03', col: 2, row: 0, name: '郑浩', studentId: '2024011', status: 'present', submitted: false },
      { seatNo: 'A-04', col: 3, row: 0, name: '冯雪', studentId: '2024012', status: 'present', submitted: false },
      { seatNo: 'A-05', col: 4, row: 0, name: '褚明', studentId: '2024013', status: 'present', submitted: false },
      { seatNo: 'A-06', col: 5, row: 0, name: '卫华', studentId: '2024014', status: 'present', submitted: false },
      { seatNo: 'B-01', col: 0, row: 1, name: '蒋丽', studentId: '2024015', status: 'present', submitted: false },
      { seatNo: 'B-02', col: 1, row: 1, name: '沈涛', studentId: '2024016', status: 'present', submitted: false },
      { seatNo: 'B-03', col: 2, row: 1, name: '韩梅', studentId: '2024017', status: 'present', submitted: false },
      { seatNo: 'B-04', col: 3, row: 1, name: '杨光', studentId: '2024018', status: 'present', submitted: false },
      { seatNo: 'B-05', col: 4, row: 1, name: '朱琳', studentId: '2024019', status: 'present', submitted: false },
      { seatNo: 'B-06', col: 5, row: 1, name: '秦飞', studentId: '2024020', status: 'present', submitted: false },
      { seatNo: 'C-01', col: 0, row: 2, name: '尤娜', studentId: '2024021', status: 'present', submitted: false },
      { seatNo: 'C-02', col: 1, row: 2, name: '许磊', studentId: '2024022', status: 'present', submitted: false },
      { seatNo: 'C-03', col: 2, row: 2, name: '何静', studentId: '2024023', status: 'present', submitted: false },
      { seatNo: 'C-04', col: 3, row: 2, name: '吕峰', studentId: '2024024', status: 'present', submitted: false },
      { seatNo: 'C-05', col: 4, row: 2, name: '施颖', studentId: '2024025', status: 'present', submitted: false },
      { seatNo: 'C-06', col: 5, row: 2, name: '张帆', studentId: '2024026', status: 'present', submitted: false },
      { seatNo: 'D-01', col: 0, row: 3, name: '孔明', studentId: '2024027', status: 'present', submitted: false },
      { seatNo: 'D-02', col: 1, row: 3, name: '曹阳', studentId: '2024028', status: 'present', submitted: false },
      { seatNo: 'D-03', col: 2, row: 3, name: '严芳', studentId: '2024029', status: 'present', submitted: false },
      { seatNo: 'D-04', col: 3, row: 3, name: '华子', studentId: '2024030', status: 'present', submitted: false },
      { seatNo: 'D-05', col: 4, row: 3, name: '金辉', studentId: '2024031', status: 'present', submitted: false },
      { seatNo: 'D-06', col: 5, row: 3, name: '魏然', studentId: '2024032', status: 'present', submitted: false },
      { seatNo: 'E-01', col: 0, row: 4, name: '陶然', studentId: '2024033', status: 'present', submitted: false },
      { seatNo: 'E-02', col: 1, row: 4, name: '姜维', studentId: '2024034', status: 'present', submitted: false },
      { seatNo: 'E-03', col: 2, row: 4, name: '范雨', studentId: '2024035', status: 'present', submitted: false },
      { seatNo: 'E-04', col: 3, row: 4, name: '彭飞', studentId: '2024036', status: 'present', submitted: false },
      { seatNo: 'E-05', col: 4, row: 4, name: '邓超', studentId: '2024037', status: 'present', submitted: false },
      { seatNo: 'E-06', col: 5, row: 4, name: '董洁', studentId: '2024038', status: 'present', submitted: false },
    ],
  },
]

export const SEAT_STATUS_META: Record<SeatStatus, { labelZh: string; labelEn: string }> = {
  present: { labelZh: '在场', labelEn: 'Present' },
  late: { labelZh: '迟到', labelEn: 'Late' },
  absent: { labelZh: '缺考', labelEn: 'Absent' },
}
