/**
 * 各家大模型 API 的错误码对照表。
 *
 * 数据来源均为厂商官方文档（见每条 docsUrl），核对时间 2026-09。
 * 存在的意义：同一个 HTTP 状态码在不同厂商含义不同，最容易搞混的是 402 ——
 * DeepSeek 402 = 余额不足，Anthropic 402 = 账单/支付信息有问题，OpenRouter 402 = 余额不足。
 * 因此报错提示必须按「当前用的是哪家」去查表，不能只看状态码。
 */

export type ProviderProtocol = 'openai' | 'anthropic'

export type ErrorKind = 'auth' | 'billing' | 'quota' | 'request' | 'permission' | 'server' | 'notfound'

export interface ErrorCodeEntry {
  status: number
  /** 厂商自己的错误码 / 错误类型，没有则留空 */
  code?: string
  /** 官方文档里的名称，保留英文原文便于搜索 */
  officialName: string
  /** 中文含义 */
  meaning: string
  /** 该怎么办 */
  fix: string
  kind: ErrorKind
  /** 重试是否有意义；账单类重试无用，必须先去充值 */
  retryable: boolean
}

export interface ProviderErrorDoc {
  id: string
  name: string
  protocol: ProviderProtocol
  baseUrl: string
  chatPath: string
  /** 官方错误码文档 */
  docsUrl: string
  /** 官方错误响应体形状，用来说明怎么解析 */
  errorShape: string
  /** 限流时应该读的响应头 */
  retryHeader?: string
  codes: ErrorCodeEntry[]
}

export const ERROR_KIND_META: Record<ErrorKind, { label: string; className: string }> = {
  auth: { label: '认证', className: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
  billing: { label: '账单', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  quota: { label: '配额', className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300' },
  request: { label: '请求', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  permission: { label: '权限', className: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' },
  server: { label: '服务端', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  notfound: { label: '不存在', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
}

export const PROVIDER_ERROR_DOCS: ProviderErrorDoc[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    protocol: 'openai',
    baseUrl: 'https://api.deepseek.com',
    chatPath: '/chat/completions',
    docsUrl: 'https://api-docs.deepseek.com/zh-cn/quick_start/error_codes',
    errorShape: '{ "error": { "message": "…", "type": "…", "code": "…" } }',
    retryHeader: 'Retry-After',
    codes: [
      { status: 400, officialName: 'Invalid Format', meaning: '请求体格式错误', fix: '按报错信息提示修改请求体结构', kind: 'request', retryable: false },
      { status: 401, officialName: 'Authentication Fails', meaning: 'API Key 错误，认证失败', fix: '检查 API Key 是否正确、是否有多余空格；没有就先创建 Key', kind: 'auth', retryable: false },
      { status: 402, officialName: 'Insufficient Balance', meaning: '账号余额不足', fix: '确认账户余额，前往「充值」页面充值后才能继续调用', kind: 'billing', retryable: false },
      { status: 422, officialName: 'Invalid Parameters', meaning: '请求体参数错误', fix: '按报错信息核对参数名与取值', kind: 'request', retryable: false },
      { status: 429, officialName: 'Rate Limit Reached', meaning: '请求速率（TPM / RPM）达到上限', fix: '降低并发与请求频率；官方建议此时可临时切换到其他厂商', kind: 'quota', retryable: true },
      { status: 500, officialName: 'Server Error', meaning: '服务端内部故障', fix: '稍后重试；持续出现请联系官方支持', kind: 'server', retryable: true },
      { status: 503, officialName: 'Server Overloaded', meaning: '服务端负载过高', fix: '稍等后重试', kind: 'server', retryable: true },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    chatPath: '/v1/messages',
    docsUrl: 'https://platform.claude.com/docs/en/api/errors',
    errorShape: '{ "type": "error", "error": { "type": "…", "message": "…" }, "request_id": "req_…" }',
    retryHeader: 'retry-after（另有 anthropic-ratelimit-* 系列头）',
    codes: [
      { status: 400, code: 'invalid_request_error', officialName: 'Invalid request', meaning: '请求格式或内容有问题；也可能是你自己设置的组织/工作区消费上限被触顶', fix: '检查请求体；若为消费上限，去 Claude Console 调整额度', kind: 'request', retryable: false },
      { status: 401, code: 'authentication_error', officialName: 'Authentication error', meaning: 'API Key 有问题（格式错误、已撤销或已过期）', fix: '到 Claude Console 重新生成 Key', kind: 'auth', retryable: false },
      { status: 402, code: 'billing_error', officialName: 'Billing error', meaning: '账单或支付信息有问题（注意：不是「余额不足」）', fix: '到 Claude Console 的 Billing 检查支付方式；走 AWS 的检查 AWS Marketplace', kind: 'billing', retryable: false },
      { status: 403, code: 'permission_error', officialName: 'Permission error', meaning: 'Key 没有访问该资源的权限', fix: '检查组织访问权限与工作区设置', kind: 'permission', retryable: false },
      { status: 404, code: 'not_found_error', officialName: 'Not found', meaning: '请求的资源不存在', fix: '检查 endpoint 路径与资源 ID 拼写', kind: 'notfound', retryable: false },
      { status: 409, code: 'conflict_error', officialName: 'Conflict', meaning: '请求与资源当前状态冲突（并发修改、唯一值重复）', fix: '解决冲突后重试', kind: 'request', retryable: true },
      { status: 413, code: 'request_too_large', officialName: 'Request too large', meaning: '请求体超过上限（Messages API 单请求 32MB）', fix: '拆分请求或先压缩附件', kind: 'request', retryable: false },
      { status: 429, code: 'rate_limit_error', officialName: 'Rate limit', meaning: '触达速率限制，或达到所在 tier 的月度消费上限', fix: '读 retry-after 后按指数退避重试；若是消费上限则重试无用，需提升 tier', kind: 'quota', retryable: true },
      { status: 500, code: 'api_error', officialName: 'API error', meaning: 'Anthropic 服务端出现意外错误', fix: '指数退避重试；持续出现带上 request_id 联系支持', kind: 'server', retryable: true },
      { status: 504, code: 'timeout_error', officialName: 'Timeout', meaning: '请求处理超时', fix: '改用流式 Messages API，或把长任务拆小', kind: 'server', retryable: true },
      { status: 529, code: 'overloaded_error', officialName: 'Overloaded', meaning: 'API 暂时过载（Anthropic 特有状态码，不是你的配额问题）', fix: '等待后重试；可切换其他模型，容量是按模型计的', kind: 'server', retryable: true },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    protocol: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    chatPath: '/chat/completions',
    docsUrl: 'https://platform.openai.com/docs/guides/error-codes/api-errors',
    errorShape: '{ "error": { "message": "…", "type": "…", "param": null, "code": "…" } }',
    retryHeader: 'Retry-After',
    codes: [
      { status: 400, code: 'invalid_request_error', officialName: 'Invalid request', meaning: '请求格式/内容有问题（例如不允许的 service_tier）', fix: '按 error.param 定位具体字段后修正', kind: 'request', retryable: false },
      { status: 401, code: 'invalid_api_key', officialName: 'Incorrect API key provided', meaning: 'API Key 不正确', fix: '确认 Key 与调用的 organization/project 匹配；必要时重新生成', kind: 'auth', retryable: false },
      { status: 401, code: 'ip_not_authorized', officialName: 'IP not authorized', meaning: '请求 IP 不在项目的 IP 白名单内', fix: '从正确 IP 发起，或调整白名单设置', kind: 'auth', retryable: false },
      { status: 403, officialName: 'Country, region, or territory not supported', meaning: '所在国家/地区不支持调用', fix: '更换支持的地区网络环境', kind: 'permission', retryable: false },
      { status: 404, officialName: 'Not found', meaning: '模型或资源不存在', fix: '检查 model 名称与 endpoint', kind: 'notfound', retryable: false },
      { status: 422, officialName: 'Unprocessable entity', meaning: '参数语义不合法', fix: '按报错信息修正参数', kind: 'request', retryable: false },
      { status: 429, code: 'credit_balance_exhausted', officialName: 'Credit balance exhausted', meaning: '预付额度已用尽（旧文档里的 insufficient_quota 现在多以此 code 出现）', fix: '到 Billing 充值；账单类错误重试无效', kind: 'billing', retryable: false },
      { status: 429, code: 'rate_limit_error', officialName: 'Rate limit reached for requests', meaning: '请求速率超限', fix: '按 Retry-After 退避重试，避免突发流量', kind: 'quota', retryable: true },
      { status: 429, code: 'slow_down', officialName: 'Slow down', meaning: '请求速率上升过快', fix: '降低速率后逐步提升', kind: 'quota', retryable: true },
      { status: 429, code: 'organization_spend_limit_exceeded', officialName: 'Organization spend limit reached', meaning: '组织达到强制消费上限', fix: '提高或移除组织消费上限，或等月度重置', kind: 'billing', retryable: false },
      { status: 429, code: 'project_spend_limit_exceeded', officialName: 'Project spend limit reached', meaning: '项目达到强制消费上限', fix: '提高项目消费上限，或等月度重置', kind: 'billing', retryable: false },
      { status: 429, code: 'organization_usage_limit_exceeded', officialName: 'Organization usage limit reached', meaning: '组织达到 OpenAI 分配的用量上限', fix: '申请更高的用量上限', kind: 'quota', retryable: false },
      { status: 500, officialName: 'The server had an error', meaning: 'OpenAI 服务端错误', fix: '稍后重试；持续出现查看 status.openai.com', kind: 'server', retryable: true },
      { status: 503, code: 'server_is_overloaded', officialName: 'Model temporarily overloaded', meaning: '模型临时过载', fix: '按 Retry-After 重试，或换模型', kind: 'server', retryable: true },
    ],
  },
  {
    id: 'qwen',
    name: '通义千问（阿里云百炼 DashScope）',
    protocol: 'openai',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    chatPath: '/chat/completions',
    docsUrl: 'https://help.aliyun.com/zh/model-studio/error-code',
    errorShape: '{ "code": "…", "message": "…", "request_id": "…" }',
    codes: [
      { status: 400, code: 'InvalidParameter', officialName: 'InvalidParameter', meaning: '参数非法（如输入长度超出模型上下文）', fix: '按 code 核对参数名、类型与取值范围', kind: 'request', retryable: false },
      { status: 401, code: 'InvalidApiKey', officialName: 'InvalidApiKey', meaning: 'API Key 无效', fix: '检查 Key 有效性与区域绑定（各地域 Key 不同），必要时重新获取', kind: 'auth', retryable: false },
      { status: 403, code: 'AccessDenied / Model.AccessDenied / App.AccessDenied', officialName: 'AccessDenied', meaning: '无权限访问该模型或应用', fix: '检查工作空间与模型授权', kind: 'permission', retryable: false },
      { status: 404, code: 'ModelNotFound', officialName: 'ModelNotFound', meaning: '模型不存在', fix: '确认 model 名称在支持清单内且拼写正确', kind: 'notfound', retryable: false },
      { status: 409, code: 'Conflict', officialName: 'Conflict', meaning: '资源重名等冲突', fix: '更换名称后重试', kind: 'request', retryable: false },
      { status: 429, code: 'Throttling / Throttling.RateQuota / Throttling.AllocationQuota', officialName: 'Throttling', meaning: '限流：短时间内请求过于密集或瞬时 Token 峰值过高', fix: '等待一分钟后重试；频繁触发就降低频率，并把大任务拆成小批分时段提交', kind: 'quota', retryable: true },
      { status: 500, code: 'InternalError / RequestTimeOut', officialName: 'InternalError', meaning: '内部错误或请求超时', fix: '记录 request_id 提工单，稍后重试', kind: 'server', retryable: true },
      { status: 503, code: 'ModelUnavailable', officialName: 'ModelUnavailable', meaning: '模型暂不可用', fix: '稍后重试或切换可用模型', kind: 'server', retryable: true },
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    protocol: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    chatPath: '/chat/completions',
    docsUrl: 'https://openrouter.ai/docs/api-reference/errors',
    errorShape: '{ "error": { "code": 402, "message": "…", "metadata": { "error_type": "…", "provider_code": "…" } } }',
    retryHeader: 'Retry-After（平台限流时另有 X-RateLimit-*）',
    codes: [
      { status: 400, officialName: 'Bad Request', meaning: '参数无效或缺失、CORS 问题', fix: '检查请求体与跨域配置', kind: 'request', retryable: false },
      { status: 401, officialName: 'Invalid credentials', meaning: '凭据无效（Key 被禁用或过期）', fix: '重新生成 API Key', kind: 'auth', retryable: false },
      { status: 402, officialName: 'Insufficient credits', meaning: '账户或该 Key 的余额不足（注意：余额为负时连免费模型也会 402）', fix: '充值使余额转正；或检查该 Key 的 limit_remaining 是否耗尽', kind: 'billing', retryable: false },
      { status: 403, officialName: 'Moderation flagged', meaning: '所选模型要求审核，而输入被标记', fix: '查看 error.metadata 中的 reasons 与 flagged_input', kind: 'permission', retryable: false },
      { status: 408, officialName: 'Request timeout', meaning: '请求超时', fix: '重试或改用流式', kind: 'server', retryable: true },
      { status: 429, code: 'rate_limit_exceeded', officialName: 'Rate limited', meaning: '被限流：可能是平台免费模型的额度，也可能是上游供应商限流', fix: '指数退避重试；若 metadata.provider_code 有值说明是上游限流，可开启 fallback 路由', kind: 'quota', retryable: true },
      { status: 502, officialName: 'Model down / invalid upstream response', meaning: '所选模型不可用，或上游返回了无效响应', fix: '重试或切换模型；可配置 fallback models', kind: 'server', retryable: true },
      { status: 503, officialName: 'No available provider', meaning: '没有满足你路由要求的可用供应商', fix: '放宽 provider 路由偏好，或换模型', kind: 'server', retryable: true },
    ],
  },
]

export function providerErrorDoc(id: string): ProviderErrorDoc | undefined {
  return PROVIDER_ERROR_DOCS.find((doc) => doc.id === id)
}

/**
 * 按「厂商 + HTTP 状态码（+ 可选业务 code）」查官方解释。
 * 同一厂商同一状态码可能有多条（如 OpenAI 的 429 有 5 种），
 * 传入 code 时优先精确匹配，未传则返回该状态码的第一条通用说明。
 */
export function lookupErrorCode(
  providerId: string,
  status: number,
  code?: string,
): ErrorCodeEntry | undefined {
  const doc = providerErrorDoc(providerId)
  if (!doc) return undefined
  const sameStatus = doc.codes.filter((entry) => entry.status === status)
  if (sameStatus.length === 0) return undefined
  if (!code) return sameStatus[0]
  const normalized = code.toLowerCase()
  return (
    sameStatus.find((entry) =>
      entry.code?.toLowerCase().split(' / ').some((item) => item === normalized || item.includes(normalized)),
    ) ?? sameStatus[0]
  )
}

/** 平台侧统一的错误展示文案：厂商官方名称 + 中文含义 + 处理办法 */
export function describeError(providerId: string, status: number, code?: string): string {
  const doc = providerErrorDoc(providerId)
  const entry = lookupErrorCode(providerId, status, code)
  if (!entry) {
    return `HTTP ${status}：该状态码在 ${doc?.name ?? providerId} 官方错误码文档中没有对应条目，请对照文档确认：${doc?.docsUrl ?? ''}`
  }
  return `HTTP ${status} · ${entry.officialName} —— ${entry.meaning}。建议：${entry.fix}`
}
