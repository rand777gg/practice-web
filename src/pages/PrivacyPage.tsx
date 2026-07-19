export function Component() {
  return (
    <div className="min-h-screen bg-background p-6 md:p-10 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">隐私政策</h1>
      <div className="prose prose-sm dark:prose-invert space-y-4">
        <p>最后更新日期：2026年7月20日</p>
        <h2 className="text-lg font-semibold mt-6">1. 信息收集</h2>
        <p>我们通过 Supabase Auth 收集您注册时提供的邮箱地址。您的答题记录、收藏、笔记等数据存储在 Supabase 数据库中。</p>
        <h2 className="text-lg font-semibold mt-6">2. 信息使用</h2>
        <p>您的数据仅用于提供刷题服务：记录学习进度、生成统计数据、同步多设备数据。我们不会将您的数据出售或分享给第三方。</p>
        <h2 className="text-lg font-semibold mt-6">3. GitHub 登录</h2>
        <p>使用 GitHub OAuth 登录时，我们仅获取您的 GitHub 用户名和邮箱用于账号认证，不会访问您的代码仓库。</p>
        <h2 className="text-lg font-semibold mt-6">4. 数据安全</h2>
        <p>所有数据传输均通过 HTTPS 加密。数据库访问受 Row Level Security 保护，每个用户只能访问自己的数据。</p>
        <h2 className="text-lg font-semibold mt-6">5. 数据删除</h2>
        <p>您可以在设置页注销账号，所有个人数据将被永久删除。部分匿名化的统计数据可能保留用于系统改进。</p>
        <h2 className="text-lg font-semibold mt-6">6. Cookie</h2>
        <p>本网站使用必要的 Cookie 维持登录状态和用户偏好设置。</p>
      </div>
    </div>
  )
}
