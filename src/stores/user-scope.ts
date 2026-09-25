/**
 * 用户作用域：谁的数据现在在内存里。
 *
 * 为什么需要单独一个模块：登出/换号时，用户级 Store 里的旧数据必须被清掉，否则下一个
 * 登录的人会先看到上一个人的会话、错题和计划 —— 这些 Store 分散在十几个文件里，靠
 * 每个登录入口各自记得清是不现实的。这里让每个用户级 Store 自己登记一个 reset，由认证
 * 生命周期统一触发。
 */

type Resetter = () => void

const resetters = new Set<Resetter>()

/** 用户级 Store 在模块顶层调用一次；返回注销函数（主要给测试用） */
export function registerUserScopedStore(reset: Resetter): () => void {
  resetters.add(reset)
  return () => { resetters.delete(reset) }
}

let activeUserId: string | null = null

/** 当前作用域里的用户 id，给需要在读写前自查的 Store 用 */
export function currentScopeUserId(): string | null {
  return activeUserId
}

/**
 * 认证状态变化时调用。只在用户身份真的变了（含 登录 → 登出）时才清，
 * 令牌刷新、同一用户重复 SIGNED_IN 都不会触发 —— 那会白扔掉正在看的数据。
 */
export function syncUserScope(nextUserId: string | null): void {
  if (activeUserId === nextUserId) return
  activeUserId = nextUserId
  for (const reset of resetters) {
    try {
      reset()
    } catch (e) {
      console.error('user-scoped store reset failed:', e)
    }
  }
}
