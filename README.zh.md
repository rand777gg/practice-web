中文 | [English](README.md)

#  刷题网站

基于 React + Supabase 的单选题刷题网站。支持练习模式（学科/分类筛选）、可配置考试模式、错题回顾、题目纠错，以及题目管理（增删改查 + CSV/JSON 导入，含学科和解析字段）。界面支持中英文切换。支持 PWA 离线缓存。移动端支持左右滑动切换题目。

## 技术栈

- **前端**：React 19、TypeScript、Vite
- **UI**：Tailwind CSS 4、shadcn/ui、Radix UI（Dropdown Menu、Dialog 等）、Lucide 图标
- **状态管理**：Zustand
- **路由**：React Router v7（懒加载）
- **后端**：Supabase（认证、数据库、RLS）
- **国际化**：内置中英文切换

## 功能

| 功能 | 说明 |
|---|---|
| **练习模式** | 随机单选题，即时显示对错反馈 |
| **考试模式** | 可配置题目数量（5–200）和时长（5–300 分钟），题目导航器，断点续考，超时自动提交，出分报告 |
| **错题回顾** | 按练习/考试模式筛选，高亮正确答案 |
| **题目管理** | 创建、编辑、删除题目，支持动态选项数量（2 个以上） |
| **批量导入** | 支持 CSV 或 JSON 文件导入题目 |
| **学科与解析** | 题目支持学科标签（如：逻辑学、数学）和解析字段，用于答案解析 |
| **学科筛选** | 练习模式提供主题化下拉菜单，可按学科或分类筛选题目 |
| **题目纠错** | 用户可对题目进行纠错反馈 |
| **用户角色** | 管理员（管理题目和用户）和普通用户（仅练习） |
| **首用户自动管理员** | 第一位注册用户通过数据库触发器自动成为管理员 |
| **移动端适配** | 可折叠侧边栏、表格和表单自适应、练习和考试模式左右滑动切换题目 |
| **PWA** | Service Worker 离线缓存，可在手机和桌面端安装 |
| **深色模式** | 跟随系统偏好、localStorage 持久化、0.25s 平滑过渡动画，顶栏和登录页均有切换按钮 |
| **国际化** | 顶栏 Radix Dropdown Menu 中英文切换 |

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
