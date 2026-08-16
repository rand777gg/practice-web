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
      <h1 className="text-2xl font-bold mb-6">服务条款</h1>
      <div className="prose prose-base dark:prose-invert space-y-4">
        <p>最后更新日期：2026年7月23日</p>

        <h2 className="text-lg font-semibold mt-6">1. 服务说明</h2>
        <p>Practice Web（以下简称"本网站"）是一个在线题目练习平台，提供刷题、考试模拟、知识点管理等功能。用户可选择通过邮箱注册或 GitHub OAuth 登录。</p>

        <h2 className="text-lg font-semibold mt-6">2. 账号与认证</h2>
        <p>用户可以选择以下方式保护账号：</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>邮箱密码登录</strong> — 密码由 Supabase Auth 加密存储，本网站不接触明文密码。</li>
          <li><strong>GitHub OAuth 登录</strong> — 通过 GitHub 官方 OAuth 流程认证，本网站不会获取您的 GitHub 密码或代码仓库访问权限。</li>
          <li><strong>TOTP 两步验证</strong> — 支持 Google Authenticator、Microsoft Authenticator 等标准认证器应用，生成基于时间的一次性 6 位验证码。密钥仅存储在服务端隔离表中，客户端不可读取。</li>
          <li><strong>Passkey 生物认证</strong> — 支持指纹、面容、PIN 等设备原生认证方式。密钥材料（私钥）仅存储在您的设备安全芯片中，服务器仅保存公钥用于验证签名。采用 WebAuthn 标准的 challenge-response 机制，每次认证需服务器颁发一次性 challenge。</li>
          <li><strong>MFA 宽限期</strong> — TOTP 验证通过后可设置 7 天内免验证（可在设置页调整有效期或设为每次登录都验证）。</li>
        </ul>
        <p>用户应妥善保管账号和认证设备，因自身原因导致账号泄露的，本网站不承担责任。</p>

        <h2 className="text-lg font-semibold mt-6">3. 登录保护</h2>
        <p>本网站对登录尝试实施频率限制与登录审计，异常行为将被记录并可能被限制访问。</p>

        <h2 className="text-lg font-semibold mt-6">4. 用户责任</h2>
        <p>用户上传的题目内容应符合法律法规，不得包含违法、侵权或不当信息。用户笔记和公开笔记应符合社区规范，不得发布垃圾广告或恶意内容。</p>

        <h2 className="text-lg font-semibold mt-6">5. 知识产权</h2>
        <p>本网站的代码、设计及用户上传的题目内容均受相关知识产权法律保护。未经许可，不得复制、分发或修改本网站内容。</p>

        <h2 className="text-lg font-semibold mt-6">6. 免责声明</h2>
        <p>本网站按"现状"提供服务，不对服务的连续性、准确性作任何保证。因不可抗力或系统维护导致的服务中断，本网站不承担责任。</p>

        <h2 className="text-lg font-semibold mt-6">7. 服务变更</h2>
        <p>我们保留随时修改或终止服务的权利，重大变更将提前通知用户。</p>

        <h2 className="text-lg font-semibold mt-6">8. 联系方式</h2>
        <p>如有问题，请通过 GitHub Issues 联系我们。</p>
      </div>
    </div>
  )
}
