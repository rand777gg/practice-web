中文 | [English](README.md)

#  刷题网站

基于 React + Supabase 的全题型刷题网站。支持练习/考试模式、错题回顾、公开笔记、题目管理（增删改查 + 批量导入）、AI 智能解析、ECharts 仪表盘分析。界面支持中英文切换。支持 PWA 离线缓存。移动端底部导航栏 + 左右滑动切换题目。

## 技术栈

- **前端**：React 19、TypeScript、Vite
- **UI**：Tailwind CSS 4、shadcn/ui、Radix UI、Lucide 图标
- **图表**：ECharts 6（仪表盘分析）
- **状态管理**：Zustand
- **路由**：React Router v7（懒加载）
- **后端**：Supabase（认证、数据库、RLS）
- **AI**：Vercel AI SDK + DeepSeek（题目解析、知识点生成、智能出题、学习计划、每日总结）
- **国际化**：内置中英文切换

## 功能

| 功能 | 说明 |
|---|---|
| **仪表盘分析** | ECharts 图表：每日学习热力图、环形时间分布（7环×24h）、学科堆叠柱状图、时间散点图、正确率横向柱状图+学科×题型热力图、扇形图+矩阵树图（中国传统色配色，支持下钻）、桑基流向图 |
| **计划进度** | 顶栏进度条追踪长期目标+自定义每日目标，完成后显示恭喜消息 |
| **移动端底部导航** | iOS 风格底部 Tab 栏（仪表盘/练习/考试/收藏/错题回顾），手机和平板显示，磨砂玻璃质感，偏好设置中可自定义 |
| **练习模式** | 题目范围筛选（全部/仅收藏/仅错题），选题模式（混合/新题优先/错题优先），学科/分类/题型多选筛选，笔记+公开/私有切换，滑动切换 |
| **考试模式** | 可配置题目数量和时长，多选学科/分类/题型筛选，题目导航器，断点续考，超时自动提交，ECharts 出分报告 |
| **错题回顾** | 按模式筛选，行内笔记编辑，收藏，答案对错高亮 |
| **公开笔记** | 统一卡片布局，答案对比+可见性徽章+作者信息 |
| **题目管理** | CRUD，动态选项数量，学科/分类/题型/导入模式/验证状态筛选，每页条数选择，批量编辑/删除 |
| **批量导入** | CSV、JSON 或 AI 文档解析导入 |
| **用户角色** | 管理员（管理题目和用户、AI 配置）和普通用户（仅练习） |
| **首用户自动管理员** | 第一位注册用户通过数据库触发器自动成为管理员 |
| **移动端/平板适配** | 底部导航栏（磨砂玻璃质感）、可折叠侧边栏、图表自适应、左右滑动切换题目 |
| **PWA** | Service Worker 离线缓存，可在手机和桌面端安装 |
| **深色模式** | 跟随系统偏好、localStorage 持久化，顶栏和登录页均有切换按钮 |
| **护眼模式** | 6 种中国传统配色主题（绢色/青瓷/藕荷/茶白/竹青） |
| **国际化** | 顶栏 中英文切换 |

## 快速开始

### 前置条件

- Node.js 18+
- 一个 [Supabase](https://supabase.com) 项目

### 1. 克隆并安装

```bash
git clone https://github.com/rand777gg/react-practice-web.git
cd practice-web
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，填入你的 Supabase 凭据（在 Supabase 项目设置 → API 中获取）：

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

> `.env` 已被 gitignore 忽略，切勿提交真实密钥。

### 3. 初始化 Supabase 数据库

打开 Supabase 项目 → **SQL Editor**，将 `supabase/migrations/001_initial_schema.sql` 全部内容粘贴并执行。

这会创建所有表、索引、首用户管理员触发器，以及行级安全（RLS）策略。

### 4. 启动开发服务器

```bash
npm run dev
```

访问 `http://localhost:5173`，注册账号——第一个用户自动成为管理员。

### 5. 添加题目

以管理员身份进入 **题目管理** → **导入**，上传 `sample-questions.csv`（含 18 道示例题目），或使用 **添加题目** 手动创建。

## 项目结构

```
practice-web/
├── index.html
├── .env.example                  # 环境变量模板
├── sample-questions.csv          # 导入测试用示例题目
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
└── src/
    ├── main.tsx
    ├── App.tsx                   # 鉴权初始化 + 会话监听
    ├── index.css                 # Tailwind + CSS 自定义属性
    ├── types/                    # TypeScript 类型定义
    ├── lib/                      # supabase 客户端、工具函数、常量
    ├── stores/                   # Zustand 状态（auth、exam、lang、theme）
    ├── hooks/                    # 自定义 Hook（useQuestions、useTimer、useSwipe 等）
    ├── i18n/                     # 翻译文件（中/英）+ useT Hook
    ├── router/                   # 路由定义（懒加载）
    ├── components/
    │   ├── ui/                   # shadcn 基础组件
    │   ├── auth/                 # 登录/注册表单、路由守卫
    │   ├── layout/               # 布局、侧边栏、顶栏、加载页
    │   ├── questions/            # 题目卡片、表单、列表、导入弹窗
    │   ├── practice/             # 练习会话
    │   └── exam/                 # 考试会话、计时器、进度条、成绩单
    └── pages/                    # 路由页面（admin/ 子目录为管理页）
```

## 路由表

| 路径 | 页面 | 权限 |
|---|---|---|
| `/login` | 登录 | 公开 |
| `/register` | 注册 | 公开 |
| `/` | 仪表盘 | 需登录 |
| `/practice` | 练习模式 | 需登录 |
| `/exam` | 考试模式 | 需登录 |
| `/exam/result/:sessionId` | 考试成绩 | 需登录 |
| `/review` | 错题回顾 | 需登录 |
| `/admin/questions` | 题目管理 | 管理员 |
| `/admin/questions/new` | 创建题目 | 管理员 |
| `/admin/questions/:id/edit` | 编辑题目 | 管理员 |
| `/admin/users` | 用户管理 | 管理员 |

## 命令

```bash
npm run dev       # 启动开发服务器
npm run build     # TypeScript 检查 + 生产构建
npm run preview   # 本地预览生产构建
```

## 部署

构建项目，将 `dist/` 文件夹部署到任意静态托管服务（Vercel、Netlify、Cloudflare Pages 等）：

```bash
npm run build
```

在托管平台设置环境变量 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_PUBLISHABLE_KEY`（不要放在仓库中）。

## 开源协议

MIT
