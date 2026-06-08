import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Dice6 } from 'lucide-react'
import { hasAiConfig } from '@/lib/ai'
import { useT } from '@/i18n/use-t'

const ADJECTIVES = ['勤奋的', '勇敢的', '机智的', '冷静的', '乐观的', '执着的', '专注的', '敏捷的', '沉稳的', '好奇的']
const NOUNS = ['学者', '探索者', '思考者', '求知者', '攀登者', '追光者', '行者', '旅人', '书虫', '夜猫']

function randomNickname(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]
  const num = Math.floor(Math.random() * 1000)
  return `${adj}${noun}${num}`
}

export function NicknameDialog() {
  const { t } = useT()
  const { user, profile, refreshProfile } = useAuthStore()
  const [nickname, setNickname] = useState(profile?.nickname || '')
  const [saving, setSaving] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)

  if (!user || profile?.nickname) return null

  const save = async (name: string) => {
    if (!name.trim()) return
    setSaving(true)
    await supabase.from('profiles').update({ nickname: name.trim() }).eq('id', user.id)
    await refreshProfile()
    setSaving(false)
  }

  const handleRandom = async () => {
    if (hasAiConfig()) {
      setAiLoading(true)
      try {
        const { createDeepSeek } = await import('@ai-sdk/deepseek')
        const { generateText } = await import('ai')
        const model = createDeepSeek({
          apiKey: import.meta.env.VITE_DEEPSEEK_API_KEY,
          baseURL: import.meta.env.VITE_DEEPSEEK_BASE_URL || undefined,
        })
        const result = await generateText({
          model: model(import.meta.env.VITE_DEEPSEEK_MODEL || 'deepseek-chat'),
          prompt: '生成一个中文学习者的昵称，2-6个字，有创意、有趣、不死板。只输出昵称，不要多余内容。',
          temperature: 1.2,
        })
        const aiName = result.text?.trim()
        if (aiName) setNickname(aiName)
      } catch { /* fallback to local */ }
      setAiLoading(false)
    } else {
      setNickname(randomNickname())
    }
  }

  return (
    <Dialog open modal>
      <DialogContent className="sm:max-w-sm [&>button:first-child]:hidden" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t('settings.nicknameRequired')}</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder={t('settings.nicknamePlaceholder')}
            className="flex-1"
            onKeyDown={(e) => { if (e.key === 'Enter') save(nickname) }}
          />
          <Button variant="outline" size="icon" onClick={handleRandom} disabled={aiLoading} title={t('settings.nicknameRandom')}>
            <Dice6 className={`h-4 w-4 ${aiLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <Button onClick={() => save(nickname)} disabled={!nickname.trim() || saving} className="w-full">
          {saving ? '...' : t('plan.save')}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
