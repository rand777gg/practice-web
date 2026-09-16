import { createRoot } from 'react-dom/client'
import './index.css'
import { RoadmapCanvas, type RoadmapStage } from '@/components/learning-route/RoadmapCanvas'

if (new URLSearchParams(location.search).get('theme') === 'dark') {
  document.documentElement.classList.add('dark')
}

const stages: RoadmapStage[] = [
  {
    id: 's1',
    label: '高等数学基础',
    meta: '2/6 题',
    done: false,
    questions: [
      { id: 'q1', label: '函数与极限的基本概念辨析', passed: true },
      { id: 'q2', label: '数列极限的四则运算法则', passed: true },
      { id: 'q3', label: '两个重要极限的推导与应用', passed: false },
      { id: 'q4', label: '无穷小与无穷大的阶的比较', passed: false },
      { id: 'q5', label: '函数的连续性与间断点分类', passed: false },
      { id: 'q6', label: '闭区间上连续函数的性质', passed: false },
    ],
  },
  {
    id: 's2',
    label: '一元函数微分学',
    meta: '0/1 题',
    done: false,
    questions: [{ id: 'q7', label: '导数的定义与几何意义', passed: false }],
  },
  {
    id: 's3',
    label: '线性代数',
    meta: '0/4 题',
    done: false,
    questions: [
      { id: 'q8', label: '行列式的性质与展开计算', passed: false },
      { id: 'q9', label: '矩阵的秩与初等变换', passed: false },
      { id: 'q10', label: '向量组的线性相关与线性无关', passed: false },
      { id: 'q11', label: '齐次线性方程组解空间的结构', passed: false },
    ],
  },
  {
    id: 's4',
    label: '阶段四：概率论与数理统计（这个标题故意写得很长用来测截断）',
    meta: '9/9 题',
    done: true,
    questions: Array.from({ length: 9 }, (_, i) => ({
      id: `q${12 + i}`,
      label: `概率论题目 ${i + 1}：随机事件与条件概率的典型考法`,
      passed: true,
    })),
  },
  {
    id: 's5',
    label: '综合模拟',
    meta: '0 题',
    done: false,
    questions: [],
  },
  {
    id: 's6',
    label: '真题冲刺',
    meta: '3/12 题',
    done: false,
    questions: Array.from({ length: 12 }, (_, i) => ({
      id: `q${30 + i}`,
      label: `冲刺题 ${i + 1}：${'选择题与填空题的综合训练'.repeat(3)}`,
      passed: i < 3,
    })),
  },
]

createRoot(document.getElementById('root')!).render(
  <div className="mx-auto max-w-5xl space-y-4 p-4">
    <div>
      <h1 className="text-xl font-bold">Frontend Developer</h1>
      <p className="text-sm text-muted-foreground">Step by step guide to becoming a modern developer</p>
    </div>
    <RoadmapCanvas
      stages={stages}
      onSelectStage={(id) => console.log('stage', id)}
      onSelectQuestion={(s, q) => console.log('question', s, q)}
    />
  </div>,
)
