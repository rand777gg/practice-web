/** 插件运行时与「插件」页之间的信号:目前用于护眼提醒的「立即试一次」 */

type Listener = () => void

const LISTENERS = new Map<string, Set<Listener>>()

export function onPluginSignal(id: string, listener: Listener): () => void {
  const set = LISTENERS.get(id) ?? new Set<Listener>()
  set.add(listener)
  LISTENERS.set(id, set)
  return () => { set.delete(listener) }
}

export function emitPluginSignal(id: string): void {
  LISTENERS.get(id)?.forEach((listener) => listener())
}
