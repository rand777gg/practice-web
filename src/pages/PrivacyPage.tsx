import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export function Component() {
  const [params] = useSearchParams()
  const from = params.get('from')
  const backTo = from === 'register' ? '/register' : '/login'

  return (
    <div className="min-h-screen bg-background p-6 md:p-10 max-w-4xl mx-auto">
      <Link to={backTo} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4" />
        {from === 'register' ? '返回注册' : '返回登录'}
      </Link>
      <h1 className="text-2xl font-bold mb-6">隐私政策</h1>
      <div className="prose prose-base dark:prose-invert space-y-4">
        <p>最后更新日期：2026年7月23日</p>

        <h2 className="text-lg font-semibold mt-6">1. 我们收集的信息</h2>
        <p>我们仅收集提供服务所必需的最小范围信息：</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>账号信息</strong> — 邮箱地址（邮箱注册）或 GitHub 用户名与公开邮箱（OAuth 登录）。均由 Supabase Auth 管理，本网站不存储明文密码。</li>
          <li><strong>学习数据</strong> — 答题记录、正确/错误结果、答题用时、收藏的题目、个人笔记（可选择公开分享）。</li>
          <li><strong>计划设置</strong> — 长期学习计划科目、每日目标量、截止日期。</li>
          <li><strong>认证凭证</strong> — TOTP 密钥（加密存储于服务端隔离表）、Passkey 公钥（WebAuthn 标准，私钥仅存于您的设备安全芯片）。</li>
          <li><strong>设备信任</strong> — 仅在您勾选「7 天内免验证」时记录，内容为一个随机设备令牌（用于识别受信任设备，到期后自动失效）。不采集操作系统、浏览器、屏幕、时区等任何设备信息。</li>
          <li><strong>偏好设置</strong> — 界面语言、主题、代码高亮风格等。</li>
        </ul>

        <h2 className="text-lg font-semibold mt-6">2. 我们不收集的信息</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>明文密码（由 Supabase Auth 加盐哈希存储，任何人无法还原）</li>
          <li>GitHub 私有仓库的任何信息（OAuth 仅获取公开资料）</li>
          <li>地理位置、IP 地址长期记录（仅在登录审计时临时使用）</li>
          <li>任何第三方跟踪器或广告 SDK</li>
        </ul>

        <h2 className="text-lg font-semibold mt-6">3. 双重认证数据处理</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>TOTP</strong> — 设置完成后密钥写入 <code>user_totp</code> 表，该表启用 RLS 但无任何 SELECT 策略，仅 Edge Function 通过 service_role 可读取。前端应用和普通用户 API 请求完全不可访问。</li>
          <li><strong>Passkey</strong> — 私钥始终存储于您设备的 TPM/安全芯片中，服务器仅保存公钥和签名计数器。每次认证需服务端签发一次性 challenge（有效期 5 分钟），过时即失效。成功认证后更新 <code>last_used_at</code> 时间戳，用于免验周期判断。</li>
          <li><strong>设备免验（信任设备）</strong> — 验证时勾选「7 天内免验证」后，当前设备以随机令牌记录于服务端 <code>user_trusted_devices</code> 表，免验期内该设备新登录无需再次验证。令牌为随机字符串，不含任何设备信息；您可在设置页「管理设备」查看、重命名或撤销任一设备。会话级验证记录存于 <code>user_mfa_sessions</code>，可在设置页撤销。</li>
        </ul>

        <h2 className="text-lg font-semibold mt-6">4. 第三方服务</h2>
        <table className="w-full text-sm">
          <thead>
            <tr><th className="text-left py-1">服务</th><th className="text-left py-1">用途</th><th className="text-left py-1">传输的数据</th></tr>
          </thead>
          <tbody>
            <tr><td className="py-1">Supabase</td><td className="py-1">数据库、认证、文件存储</td><td className="py-1">所有业务数据</td></tr>
            <tr><td className="py-1">Cloudflare R2</td><td className="py-1">笔记图片存储</td><td className="py-1">用户上传的图片文件（公开 URL 可直接访问，请勿上传敏感内容）</td></tr>
          </tbody>
        </table>

        <h2 className="text-lg font-semibold mt-6">5. 数据安全措施</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>全站 HTTPS 加密传输</li>
          <li>数据库 Row Level Security — 每个用户只能读写自己的数据</li>
          <li>Edge Function 使用 JWT 令牌验证调用者身份，拒绝伪造请求</li>
          <li>TOTP 密钥隔离存储，passkey 私钥不出设备</li>
          <li>服务端密钥（API Key、Secret）仅通过环境变量注入，不进入代码仓库</li>
        </ul>

        <h2 className="text-lg font-semibold mt-6">6. 数据删除</h2>
        <p>您可以在设置页使用"删除账号"功能。系统将永久删除以下数据：个人资料、答题记录、收藏、笔记、认证凭证（TOTP 密钥和 Passkey 公钥）、信任设备记录。Edge Function 会在执行前通过 JWT 令牌验证您是该账号的合法持有者。</p>

        <h2 className="text-lg font-semibold mt-6">7. Cookie 与本地存储</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Supabase Auth 的登录会话 Cookie（必要，维持登录状态）</li>
          <li>设备信任令牌、界面主题语言偏好（localStorage 存储，不上传）</li>
          <li>不包含任何第三方跟踪 Cookie 或广告标识符</li>
        </ul>
      </div>
    </div>
  )
}
