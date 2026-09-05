// 生成 Web Push (VAPID) 密钥对并写入 .env(已被 gitignore, 不会入库)。
// 用法: node scripts/generate-vapid.mjs
// 输出:
//   - .env 写入 VITE_VAPID_PUBLIC_KEY(前端订阅用, 带 VITE_ 前缀会被打包)
//     VAPID_PRIVATE_KEY(仅供服务端 notify-exam, 请再粘贴到 Supabase Secrets)
//   - 终端打印三项, 供粘贴到 Supabase Dashboard → Edge Functions → notify-exam
import {
  generateKeyPairSync,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const envPath = join(root, '.env')

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })

// 直接走 JWK 导出, 不依赖 SPKI/PKCS#8 的 DER 布局。
// ⚠️ 不要用 pkcs8.subarray(-32) 取私钥: Node/OpenSSL 导出的 PKCS#8 末尾带
// [1] publicKey 字段, 末 32 字节是公钥点的 Y 坐标, 不是私钥标量 —— 会生成一对
// "公钥是点、私钥是 Y" 的废钥, Web Push VAPID 验签永远失败(推送全部静默失败)。
const pubJwk = publicKey.export({ format: 'jwk' })
const x = Buffer.from(pubJwk.x, 'base64url')
const y = Buffer.from(pubJwk.y, 'base64url')
const point = Buffer.concat([Buffer.from([0x04]), x, y]) // 0x04 + X(32) + Y(32) = 65B
const publicB64 = point.toString('base64url')
const privateB64 = privateKey.export({ format: 'jwk' }).d // 32B 私钥标量(base64url)

// 自检: 用写盘前的公/私钥字符串做一次真实 ES256 签名, 确认是匹配的一对
{
  const pub = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: pubJwk.x, y: pubJwk.y }, format: 'jwk' })
  const priv = createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', x: pubJwk.x, y: pubJwk.y, d: privateB64 },
    format: 'jwk',
  })
  const data = Buffer.from('vapid-self-check|' + Date.now())
  const ok = verify('sha256', data, pub, sign('sha256', data, priv))
  if (!ok || point.length !== 65 || Buffer.from(privateB64, 'base64url').length !== 32) {
    console.error('密钥自检失败, 请勿使用本次输出!')
    process.exit(1)
  }
  console.log('✔ ES256 密钥对自检通过')
}

const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com'

function upsertLine(lines, key, value) {
  const idx = lines.findIndex((l) => l.startsWith(`${key}=`))
  const line = `${key}=${value}`
  if (idx >= 0) lines[idx] = line
  else lines.push(line)
}

let lines = existsSync(envPath) ? readFileSync(envPath, 'utf8').split(/\r?\n/) : []
upsertLine(lines, 'VITE_VAPID_PUBLIC_KEY', publicB64)
upsertLine(lines, 'VAPID_PRIVATE_KEY', privateB64)
upsertLine(lines, 'VAPID_SUBJECT', subject)
writeFileSync(envPath, lines.join('\n') + '\n')

console.log('已写入 .env:')
console.log('  VITE_VAPID_PUBLIC_KEY=' + publicB64)
console.log('  VAPID_PRIVATE_KEY=' + privateB64)
console.log('  VAPID_SUBJECT=' + subject)
console.log('')
console.log('请把下面三项粘贴到 Supabase → Edge Functions → notify-exam → Secrets:')
console.log('  VAPID_SUBJECT=' + subject)
console.log('  VAPID_PUBLIC_KEY=' + publicB64)
console.log('  VAPID_PRIVATE_KEY=' + privateB64)
