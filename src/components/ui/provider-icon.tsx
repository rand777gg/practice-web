// ponytail: 4 inline SVGs replace 54 MB @lobehub/icons; add an SVG when adding a new provider
const logos: Record<string, string> = {
  deepseek: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22%3E%3Cpath fill=%22%234c6ef5%22 d=%22M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-5l-3 2.5 3 2.5zm2 0l3-2.5-3-2.5v5z%22/%3E%3C/svg%3E',
  openai: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22%3E%3Cpath fill=%22%2374aa9c%22 d=%22M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-5l-3 2.5 3 2.5zm2 0l3-2.5-3-2.5v5z%22/%3E%3C/svg%3E',
  qwen: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22%3E%3Ccircle cx=%2212%22 cy=%2212%22 r=%2210%22 fill=%22%23ff6b00%22/%3E%3Ctext x=%2212%22 y=%2216%22 text-anchor=%22middle%22 fill=%22white%22 font-size=%2210%22 font-weight=%22bold%22%3E千%3C/text%3E%3C/svg%3E',
  openrouter: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22%3E%3Ccircle cx=%2212%22 cy=%2212%22 r=%2210%22 fill=%22%23222%22/%3E%3Cpath fill=%22%23fff%22 d=%22M7 8h10l-4 8z%22/%3E%3C/svg%3E',
}

export function ProviderIcon({ provider, size = 20 }: { provider: string; size?: number; type?: string }) {
  const src = logos[provider]
  if (!src) return <div className="rounded-full bg-muted flex items-center justify-center shrink-0" style={{ width: size, height: size }} />
  return <img src={src} alt="" className="rounded-full shrink-0" style={{ width: size, height: size }} />
}
