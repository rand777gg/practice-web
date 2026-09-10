/**
 * 专业专题 DEMO 数据。
 * 纯前端演示数据，不接任何数据库；正式接入时用同一组类型替换为查询结果即可。
 */

export interface DemoChapter {
  name: string
  /** 近五年真题平均分值 */
  score: number
  /** 考点密度 0-100，用于进度条展示 */
  density: number
}

export interface DemoQuestionBank {
  id: string
  name: string
  source: string
  count: number
  yearRange: string
  difficulty: { easy: number; medium: number; hard: number }
  tags: string[]
}

export type LiteratureType = '教材' | '论文' | '标准' | '真题'

export interface DemoLiterature {
  id: string
  type: LiteratureType
  title: string
  authors: string
  year: number
  source: string
  summary: string
  cited: number
}

export interface DemoFootprint {
  id: string
  author: string
  school: string
  year: string
  score: string
  content: string
  likes: number
  tags: string[]
}

export interface DemoTopic {
  id: string
  name: string
  code: string
  short: string
  description: string
  credit: string
  /** 在本门课考试中的分值占比（%） */
  weight: number
  /** 难度 1-5 */
  difficulty: number
  updatedAt: string
  /** 榜单热度分（综合在学人数、讨论量、完成量） */
  popularity: number
  /** 学员评分 0-5 */
  rating: number
  ratingCount: number
  /** 在学人数 */
  students: number
  /** 相较上周的排名变化，正数=上升 */
  trend: number
  /** 上榜标签 */
  badge?: '常驻榜首' | '黑马' | '口碑之选' | '题量之王'
  chapters: DemoChapter[]
  examTypes: string[]
  banks: DemoQuestionBank[]
  literatures: DemoLiterature[]
  footprints: DemoFootprint[]
}

export const DEMO_TOPICS: DemoTopic[] = [
  {
    id: 'ds',
    name: '数据结构与算法',
    code: '408-01',
    short: 'DS',
    description:
      '研究数据的逻辑结构、存储结构及其上的运算。是计算机类专业课的基石，也是 408 中分值最高的模块，算法设计题几乎全部出自本章图谱。',
    credit: '4 学分',
    weight: 30,
    difficulty: 4,
    updatedAt: '2026-09-05',
    popularity: 9820,
    rating: 4.8,
    ratingCount: 1263,
    students: 48200,
    trend: 0,
    badge: '常驻榜首',
    chapters: [
      { name: '线性表', score: 6, density: 62 },
      { name: '栈、队列与数组', score: 8, density: 71 },
      { name: '树与二叉树', score: 15, density: 92 },
      { name: '图', score: 12, density: 84 },
      { name: '查找', score: 9, density: 76 },
      { name: '排序', score: 10, density: 88 },
    ],
    examTypes: ['单项选择题', '综合应用题', '算法设计题', '复杂度分析'],
    banks: [
      {
        id: 'ds-b1',
        name: '数据结构章节精练',
        source: '按王道体系重新编排',
        count: 486,
        yearRange: '2010 - 2025',
        difficulty: { easy: 186, medium: 224, hard: 76 },
        tags: ['章节同步', '基础夯实'],
      },
      {
        id: 'ds-b2',
        name: '408 真题数据结构专项',
        source: '历年统考真题切分',
        count: 132,
        yearRange: '2009 - 2025',
        difficulty: { easy: 24, medium: 62, hard: 46 },
        tags: ['真题', '拔高'],
      },
      {
        id: 'ds-b3',
        name: '算法设计题手写专项',
        source: '平台自建判题用例',
        count: 68,
        yearRange: '2015 - 2025',
        difficulty: { easy: 8, medium: 26, hard: 34 },
        tags: ['代码题', '中心判题'],
      },
    ],
    literatures: [
      {
        id: 'ds-l1',
        type: '教材',
        title: '数据结构（C 语言版）',
        authors: '严蔚敏、吴伟民',
        year: 2018,
        source: '清华大学出版社',
        summary:
          '国内高校数据结构主流教材，伪码风格与 408 考试大纲贴合度最高，树、图两章的算法描述可直接作为答题模板。',
        cited: 4820,
      },
      {
        id: 'ds-l2',
        type: '教材',
        title: '算法导论（Introduction to Algorithms, 3rd ed.）',
        authors: 'Cormen, Leiserson, Rivest, Stein',
        year: 2009,
        source: 'MIT Press',
        summary:
          '复杂度分析与算法正确性证明的权威参考。第 22、23 章对图的两种遍历给出了严格的摊还分析，用于理解 BFS/DFS 复杂度上界。',
        cited: 31650,
      },
      {
        id: 'ds-l3',
        type: '论文',
        title: 'Depth-First Search and Linear Graph Algorithms',
        authors: 'Robert Tarjan',
        year: 1972,
        source: 'SIAM Journal on Computing',
        summary:
          'DFS 生成树与强连通分量算法的原始文献，Tarjan 由此奠定线性图算法的理论框架，是理解「低链接值」这一考点的一手来源。',
        cited: 5940,
      },
      {
        id: 'ds-l4',
        type: '真题',
        title: '全国硕士研究生招生考试计算机学科专业基础综合试题及参考答案',
        authors: '教育部教育考试院',
        year: 2025,
        source: '官方发布',
        summary: '2025 年真题原卷，含数据结构算法设计题评分细则，可直接对照练习平台的判题用例。',
        cited: 0,
      },
    ],
    footprints: [
      {
        id: 'ds-f1',
        author: '匿名学长 A',
        school: '计算机 408 上岸',
        year: '2025',
        score: '总分 138',
        content:
          '树与图这两章不要一上来就背代码。我先把 6 个教材版本的手工模拟各推一遍，再用真题刷第二轮，算法题基本就只丢实现细节分了。',
        likes: 268,
        tags: ['树与图', '二轮复习'],
      },
      {
        id: 'ds-f2',
        author: '匿名学姐 B',
        school: '跨专业二战',
        year: '2024',
        score: '总分 126',
        content:
          '跨考最大的坑是复杂度分析只记结论。建议每道综合题都写清「最好 / 最坏 / 平均」，写多了自然会推到摊还分析。',
        likes: 191,
        tags: ['复杂度', '跨考'],
      },
      {
        id: 'ds-f3',
        author: '匿名学长 C',
        school: '计算机 408 上岸',
        year: '2023',
        score: '总分 141',
        content:
          '算法设计题只要求写函数体，不要求编译通过。别在设计阶段纠结语法，先把思路写完整，最后五分钟再补边界判断。',
        likes: 342,
        tags: ['算法设计题', '答题技巧'],
      },
    ],
  },
  {
    id: 'os',
    name: '操作系统',
    code: '408-03',
    short: 'OS',
    description:
      '围绕资源管理展开：进程与调度、内存管理、文件系统、输入输出。考点偏重机制原理与典型算法的定量分析。',
    credit: '3 学分',
    weight: 23,
    difficulty: 3,
    updatedAt: '2026-08-20',
    popularity: 8740,
    rating: 4.7,
    ratingCount: 968,
    students: 41500,
    trend: 1,
    badge: '口碑之选',
    chapters: [
      { name: '操作系统概述', score: 3, density: 34 },
      { name: '进程与线程', score: 9, density: 82 },
      { name: '处理机调度', score: 7, density: 74 },
      { name: '同步与互斥', score: 8, density: 88 },
      { name: '内存管理', score: 10, density: 90 },
      { name: '文件与 I/O 管理', score: 7, density: 68 },
    ],
    examTypes: ['单项选择题', '综合应用题', 'PV 操作题', '页面置换计算'],
    banks: [
      {
        id: 'os-b1',
        name: '操作系统章节精练',
        source: '按考纲知识点编排',
        count: 368,
        yearRange: '2010 - 2025',
        difficulty: { easy: 142, medium: 176, hard: 50 },
        tags: ['章节同步', '概念辨析'],
      },
      {
        id: 'os-b2',
        name: 'PV 操作与同步大题专项',
        source: '历年综合题集合',
        count: 74,
        yearRange: '2011 - 2025',
        difficulty: { easy: 6, medium: 30, hard: 38 },
        tags: ['大题', '信号量'],
      },
    ],
    literatures: [
      {
        id: 'os-l1',
        type: '教材',
        title: '计算机操作系统（第 4 版）',
        authors: '汤小丹、梁红兵等',
        year: 2014,
        source: '西安电子科技大学出版社',
        summary: '考试大纲覆盖度最完整的教材，PV 操作与页面置换算法的例题可直接迁移到真题。',
        cited: 2980,
      },
      {
        id: 'os-l2',
        type: '教材',
        title: 'Operating System Concepts (10th ed.)',
        authors: 'Silberschatz, Galvin, Gagne',
        year: 2018,
        source: 'Wiley',
        summary: '「恐龙书」第 7、8 章对死锁与内存管理的形式化描述更严谨，适合对照教材补齐边界情形。',
        cited: 12400,
      },
      {
        id: 'os-l3',
        type: '论文',
        title: 'The UNIX Time-Sharing System',
        authors: 'Ritchie, Thompson',
        year: 1974,
        source: 'Communications of the ACM',
        summary: 'Unix 文件系统与进程模型的开山之作，理解「一切皆文件」抽象有助于串联文件管理与 I/O 两章。',
        cited: 8720,
      },
    ],
    footprints: [
      {
        id: 'os-f1',
        author: '匿名学姐 F',
        school: '软件工程 408 上岸',
        year: '2025',
        score: '总分 129',
        content: 'PV 操作的诀窍是先写「互斥还是同步」，再列资源清单，最后才动手。顺序反了就会写出永不死锁也永远不对的代码。',
        likes: 287,
        tags: ['PV 操作', '解题步骤'],
      },
      {
        id: 'os-f2',
        author: '匿名学长 G',
        school: '二战上岸',
        year: '2023',
        score: '总分 124',
        content: '页面置换建议把所有算法在同一个引用串上跑一遍并列表对比，比反复看定义有效十倍。',
        likes: 143,
        tags: ['页面置换', '对比记忆'],
      },
    ],
  },
  {
    id: 'co',
    name: '计算机组成原理',
    code: '408-02',
    short: 'CO',
    description:
      '从门电路到整机的层次化结构，核心考点集中在数据的机器级表示、CPU 指令流水线与存储层次，计算量在同卷中最大。',
    credit: '4 学分',
    weight: 25,
    difficulty: 4,
    updatedAt: '2026-08-28',
    popularity: 7960,
    rating: 4.5,
    ratingCount: 742,
    students: 36800,
    trend: -1,
    chapters: [
      { name: '数据的机器级表示', score: 8, density: 78 },
      { name: '运算方法与运算器', score: 7, density: 66 },
      { name: '存储系统', score: 12, density: 90 },
      { name: '指令系统', score: 8, density: 72 },
      { name: '中央处理器', score: 11, density: 86 },
      { name: '总线与输入输出系统', score: 6, density: 58 },
    ],
    examTypes: ['单项选择题', '综合应用题', '数值计算题', '时序分析题'],
    banks: [
      {
        id: 'co-b1',
        name: '组成原理章节精练',
        source: '按官方教材章节编排',
        count: 412,
        yearRange: '2010 - 2025',
        difficulty: { easy: 152, medium: 198, hard: 62 },
        tags: ['章节同步', '计算专项'],
      },
      {
        id: 'co-b2',
        name: 'Cache 与流水线计算专练',
        source: '高频丢分点抽取',
        count: 96,
        yearRange: '2012 - 2025',
        difficulty: { easy: 12, medium: 44, hard: 40 },
        tags: ['高频考点', '计算题'],
      },
    ],
    literatures: [
      {
        id: 'co-l1',
        type: '教材',
        title: '计算机组成原理（第 3 版）',
        authors: '唐朔飞',
        year: 2020,
        source: '高等教育出版社',
        summary: '国内 408 备考主教材，存储系统与 CPU 章节的图例与考纲一一对应，建议配合本专题章节图谱使用。',
        cited: 3610,
      },
      {
        id: 'co-l2',
        type: '教材',
        title: 'Computer Organization and Design: The Hardware/Software Interface',
        authors: 'Patterson, Hennessy',
        year: 2020,
        source: 'Morgan Kaufmann',
        summary: '流水线冒险与超标量的经典论述，附录对 RISC 数据通路的逐周期拆解可加深对时序题的理解。',
        cited: 9870,
      },
      {
        id: 'co-l3',
        type: '标准',
        title: 'IEEE 754-2019 Standard for Floating-Point Arithmetic',
        authors: 'IEEE Microprocessor Standards Committee',
        year: 2019,
        source: 'IEEE',
        summary: '浮点数规格化、舍入模式与特殊值的权威定义。真题中标号、阶码偏移量的细节全部以此为准。',
        cited: 2340,
      },
    ],
    footprints: [
      {
        id: 'co-f1',
        author: '匿名学长 D',
        school: '计算机 408 上岸',
        year: '2025',
        score: '总分 132',
        content: 'Cache 映射三种方式我画了一张 A4 大表贴桌上，每天走一遍。计算题就那几种变式，第 40 题不再是随机事件。',
        likes: 214,
        tags: ['Cache', '计算题'],
      },
      {
        id: 'co-f2',
        author: '匿名学姐 E',
        school: '通信跨考',
        year: '2024',
        score: '总分 121',
        content: '流水线一定要自己画时空图，光看教材结论永远记不住加速比。画够 30 张真题图，公式自然就出来了。',
        likes: 158,
        tags: ['流水线', '时空图'],
      },
    ],
  },
  {
    id: 'cn',
    name: '计算机网络',
    code: '408-04',
    short: 'CN',
    description:
      '自顶向下梳理协议栈，考点分布在体系结构、IP 层与传输层，计算题以子网划分、滑动窗口与拥塞控制为主。',
    credit: '3 学分',
    weight: 22,
    difficulty: 3,
    updatedAt: '2026-08-12',
    popularity: 7230,
    rating: 4.6,
    ratingCount: 655,
    students: 33900,
    trend: 2,
    badge: '黑马',
    chapters: [
      { name: '计算机网络体系结构', score: 5, density: 60 },
      { name: '物理层与数据链路层', score: 7, density: 64 },
      { name: '网络层', score: 12, density: 88 },
      { name: '传输层', score: 10, density: 86 },
      { name: '应用层', score: 6, density: 62 },
    ],
    examTypes: ['单项选择题', '综合应用题', '子网划分计算', '协议分析题'],
    banks: [
      {
        id: 'cn-b1',
        name: '计算机网络章节精练',
        source: '按协议栈自顶向下编排',
        count: 342,
        yearRange: '2010 - 2025',
        difficulty: { easy: 148, medium: 152, hard: 42 },
        tags: ['章节同步', '协议辨析'],
      },
      {
        id: 'cn-b2',
        name: '网络计算题专项',
        source: '子网 / 窗口 / 拥塞控制',
        count: 88,
        yearRange: '2012 - 2025',
        difficulty: { easy: 10, medium: 42, hard: 36 },
        tags: ['计算题', '高频'],
      },
    ],
    literatures: [
      {
        id: 'cn-l1',
        type: '教材',
        title: '计算机网络（第 8 版）',
        authors: '谢希仁',
        year: 2021,
        source: '电子工业出版社',
        summary: '国内最主流的备考教材，网络层与传输层章节的例题与真题风格接近，适合作为主线读物。',
        cited: 4200,
      },
      {
        id: 'cn-l2',
        type: '教材',
        title: 'Computer Networking: A Top-Down Approach (8th ed.)',
        authors: 'Kurose, Ross',
        year: 2021,
        source: 'Pearson',
        summary: '自顶向下视角的经典教材，拥塞控制与 TCP 状态机的图解极为清晰，适合理解「为什么这样设计」。',
        cited: 7640,
      },
      {
        id: 'cn-l3',
        type: '标准',
        title: 'RFC 9293: Transmission Control Protocol (TCP)',
        authors: 'W. Eddy',
        year: 2022,
        source: 'IETF',
        summary: 'TCP 规范的现行版本，替代了 1981 年的 RFC 793。窗口管理、重传与状态转换的权威定义都在这里。',
        cited: 860,
      },
      {
        id: 'cn-l4',
        type: '论文',
        title: 'Congestion Avoidance and Control',
        authors: 'Van Jacobson',
        year: 1988,
        source: 'ACM SIGCOMM',
        summary: '慢启动、拥塞避免与快速重传的原始论文，是「拥塞窗口如何演化」这类考题的思想源头。',
        cited: 11230,
      },
    ],
    footprints: [
      {
        id: 'cn-f1',
        author: '匿名学长 H',
        school: '计算机 408 上岸',
        year: '2025',
        score: '总分 127',
        content: '子网划分画二叉树最快，先确定借几位，再写每个子网的地址范围，比死背公式稳。考场上一分钟一道。',
        likes: 176,
        tags: ['子网划分', '速算'],
      },
      {
        id: 'cn-f2',
        author: '匿名学姐 I',
        school: '网络工程本专业',
        year: '2024',
        score: '总分 133',
        content: 'TCP 的拥塞控制建议配合抓包工具看一遍真实曲线，理解了锯齿形状，考场上任何参数都能推。',
        likes: 205,
        tags: ['拥塞控制', '抓包'],
      },
    ],
  },
  {
    id: 'db',
    name: '数据库系统原理',
    code: 'DB-01',
    short: 'DB',
    description:
      '围绕关系模型展开：SQL 与关系代数、范式与规范化、事务与并发控制、索引与查询优化。多数自命题院校的必考科目。',
    credit: '3 学分',
    weight: 35,
    difficulty: 3,
    updatedAt: '2026-08-06',
    popularity: 6120,
    rating: 4.4,
    ratingCount: 431,
    students: 22600,
    trend: 3,
    chapters: [
      { name: '关系模型与关系代数', score: 10, density: 74 },
      { name: 'SQL 与数据库设计', score: 14, density: 86 },
      { name: '范式与规范化理论', score: 8, density: 70 },
      { name: '事务与并发控制', score: 9, density: 78 },
      { name: '索引与查询优化', score: 7, density: 62 },
    ],
    examTypes: ['单项选择题', 'SQL 手写题', '范式判定题', '事务分析题'],
    banks: [
      {
        id: 'db-b1',
        name: '数据库原理章节精练',
        source: '按自命题大纲编排',
        count: 286,
        yearRange: '2012 - 2025',
        difficulty: { easy: 118, medium: 132, hard: 36 },
        tags: ['章节同步', 'SQL 专项'],
      },
      {
        id: 'db-b2',
        name: '范式判定与事务大题专项',
        source: '自命题高频题型',
        count: 64,
        yearRange: '2014 - 2025',
        difficulty: { easy: 8, medium: 28, hard: 28 },
        tags: ['大题', '范式'],
      },
    ],
    literatures: [
      {
        id: 'db-l1',
        type: '教材',
        title: '数据库系统概论（第 6 版）',
        authors: '王珊、杜小勇、陈红',
        year: 2023,
        source: '高等教育出版社',
        summary: '国内数据库课程的标准教材，关系代数与范式理论的例题体系完整，SQL 章节可直接对照练习。',
        cited: 5120,
      },
      {
        id: 'db-l2',
        type: '论文',
        title: 'A Relational Model of Data for Large Shared Data Banks',
        authors: 'E. F. Codd',
        year: 1970,
        source: 'Communications of the ACM',
        summary: '关系模型的奠基论文。读懂它才能真正理解「为什么范式能消除冗余与更新异常」，而不是死记 1NF/2NF/3NF。',
        cited: 24800,
      },
      {
        id: 'db-l3',
        type: '标准',
        title: 'SQL:2023 Standard (ISO/IEC 9075)',
        authors: 'ISO/IEC JTC 1/SC 32',
        year: 2023,
        source: 'ISO',
        summary: 'SQL 现行标准，用于核对语法细节（如窗口函数、外连接语义）与教材表述不一致的地方。',
        cited: 410,
      },
    ],
    footprints: [
      {
        id: 'db-f1',
        author: '匿名学长 J',
        school: '自命题院校上岸',
        year: '2025',
        score: '专业课 128',
        content: '范式判定题别硬套定义，直接看每个非主属性是否完全依赖候选码。画出函数依赖集再判定，基本不会错。',
        likes: 164,
        tags: ['范式', '解题套路'],
      },
      {
        id: 'db-f2',
        author: '匿名学姐 K',
        school: '软件工程 408 上岸',
        year: '2024',
        score: '专业课 121',
        content: 'SQL 手写题建议先写 FROM/JOIN 再补 SELECT，写完立刻自测一遍空值和分组边界，扣分基本都在这里。',
        likes: 132,
        tags: ['SQL', '边界值'],
      },
    ],
  },
  {
    id: 'cc',
    name: '编译原理',
    code: 'CC-01',
    short: 'CC',
    description:
      '从词法分析到代码生成的全流程。核心考点是正规式与自动机、LL/LR 语法分析、属性文法与语法制导翻译。',
    credit: '3 学分',
    weight: 30,
    difficulty: 4,
    updatedAt: '2026-07-30',
    popularity: 5380,
    rating: 4.3,
    ratingCount: 362,
    students: 18700,
    trend: 5,
    badge: '黑马',
    chapters: [
      { name: '引论与编译流程', score: 4, density: 46 },
      { name: '词法分析与自动机', score: 9, density: 80 },
      { name: '语法分析（LL / LR）', score: 14, density: 92 },
      { name: '语法制导翻译与中间代码', score: 10, density: 76 },
      { name: '运行时环境与代码优化', score: 6, density: 54 },
    ],
    examTypes: ['单项选择题', '构造题（FIRST/FOLLOW 集）', '分析表构造题', '综合应用题'],
    banks: [
      {
        id: 'cc-b1',
        name: '编译原理章节精练',
        source: '按龙书体系编排',
        count: 218,
        yearRange: '2013 - 2025',
        difficulty: { easy: 74, medium: 108, hard: 36 },
        tags: ['章节同步', '构造题'],
      },
      {
        id: 'cc-b2',
        name: 'LL(1) / LR(1) 分析表构造专项',
        source: '高频大题抽取',
        count: 52,
        yearRange: '2015 - 2025',
        difficulty: { easy: 4, medium: 22, hard: 26 },
        tags: ['大题', '分析表'],
      },
    ],
    literatures: [
      {
        id: 'cc-l1',
        type: '教材',
        title: '编译原理（第 3 版）',
        authors: '陈火旺、刘春林等',
        year: 2021,
        source: '国防工业出版社',
        summary: '国内编译原理主流教材，语法分析两章的分析表构造步骤写得很细，适合作为答题模板。',
        cited: 2860,
      },
      {
        id: 'cc-l2',
        type: '教材',
        title: 'Compilers: Principles, Techniques, and Tools (2nd ed.)',
        authors: 'Aho, Lam, Sethi, Ullman',
        year: 2006,
        source: 'Pearson',
        summary: '「龙书」。LR 项目集族构造的算法描述最为严谨，第 4 章是理解冲突消解的一手参考。',
        cited: 21400,
      },
      {
        id: 'cc-l3',
        type: '论文',
        title: 'On the Translation of Languages from Left to Right',
        authors: 'Donald Knuth',
        year: 1965,
        source: 'Information and Control',
        summary: 'LR(k) 文法的原始论文，定义了「可归约」这一判定的理论边界，是理解 LR 分析能力的起点。',
        cited: 3120,
      },
    ],
    footprints: [
      {
        id: 'cc-f1',
        author: '匿名学姐 L',
        school: '自命题院校上岸',
        year: '2025',
        score: '专业课 134',
        content: 'FIRST/FOLLOW 集一定要列表逐轮迭代，别心算。我按行标出第几轮新增了哪个终结符，检查时一眼就能定位漏项。',
        likes: 148,
        tags: ['FIRST/FOLLOW', '列表法'],
      },
      {
        id: 'cc-f2',
        author: '匿名学长 M',
        school: '计算机 408 上岸',
        year: '2023',
        score: '专业课 126',
        content: 'LR 项目集族构造是大题里最容易超时的。建议把增广文法、闭包、GOTO 三步固定成模板，考场直接套。',
        likes: 119,
        tags: ['LR', '模板化'],
      },
    ],
  },
]

export function getDemoTopic(id: string | null | undefined): DemoTopic {
  return DEMO_TOPICS.find((topic) => topic.id === id) ?? DEMO_TOPICS[0]
}

/** 按热度分降序，作为热门专业课排行榜的默认序列 */
export function getHotRanking(): DemoTopic[] {
  return [...DEMO_TOPICS].sort((a, b) => b.popularity - a.popularity)
}

export function bankCountOf(topic: DemoTopic): number {
  return topic.banks.reduce((sum, bank) => sum + bank.count, 0)
}

/** 用于取稳定的配色下标，找不到时回退到 0 */
export function topicIndexOf(id: string): number {
  const index = DEMO_TOPICS.findIndex((topic) => topic.id === id)
  return index < 0 ? 0 : index
}

export type RankingMetric = 'popularity' | 'rating' | 'students' | 'questions'

export const RANKING_METRICS: { key: RankingMetric; label: string; unit: string }[] = [
  { key: 'popularity', label: '综合热度', unit: '热度分' },
  { key: 'rating', label: '学员评分', unit: '分' },
  { key: 'students', label: '在学人数', unit: '人' },
  { key: 'questions', label: '题目数量', unit: '题' },
]

export function metricValue(topic: DemoTopic, metric: RankingMetric): number {
  if (metric === 'rating') return topic.rating
  if (metric === 'students') return topic.students
  if (metric === 'questions') return bankCountOf(topic)
  return topic.popularity
}

export function sortByMetric(topics: DemoTopic[], metric: RankingMetric): DemoTopic[] {
  return [...topics].sort((a, b) => metricValue(b, metric) - metricValue(a, metric))
}
