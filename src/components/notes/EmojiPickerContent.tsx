import { useState, useRef, useEffect } from 'react'
import { DropdownMenuContent } from '@/components/ui/dropdown-menu'

// Emoji grouped by category — each set loads incrementally
const EMOJI_SETS = [
  {
    label: '表情',
    items: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊','😇','😍','🤩','😘','😗','😚','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤔','🤐','😐','😑','😶','😏','😒','🙄','😬','😮','😯','😲','😳','🥺','😢','😭','😤','😡','🤬','😈','👿','💀','💩','🤡','👻','👽'],
  },
  {
    label: '手势',
    items: ['👍','👎','👏','🙌','🤝','💪','✌️','🤞','👌','🤏','✊','👊','🤛','🤜','👋','✋','🖐','🖖','🤟','🤘','👆','👇','👉','👈','🙏'],
  },
  {
    label: '自然',
    items: ['🔥','⭐','✨','🌟','💫','🌈','☀️','🌤','⛅','🌧','⛈','❄️','☃️','💧','🌊','🌸','🌺','🌻','🌹','🍀','🌲','🌴','🍁','🍂','🌙','🌍','⛰','🏔'],
  },
  {
    label: '物品',
    items: ['💡','🔔','🔑','🔒','🔓','📌','✂️','📎','🔗','💰','💎','🎁','🎈','🎉','🎊','🏆','🥇','🎖','📱','💻','🖥','⌨️','🖱','📷','🎥','📺','⏰','🛒','📦','🗑','🔧','🔨','⚙️'],
  },
  {
    label: '符号',
    items: ['❤️','💔','💖','💗','💙','💚','💛','🧡','💜','🖤','🤍','💯','✅','❌','⚠️','🚫','💤','💢','💦','💨','🕳','🎵','🎶','➕','➖','✖️','➗','➡️','⬅️','⬆️','⬇️','©','®','™'],
  },
  {
    label: '食物',
    items: ['🍎','🍊','🍋','🍌','🍉','🍇','🍓','🍒','🍑','🥭','🍍','🥝','🍅','🥑','🥦','🌽','🥕','🧅','🍔','🍕','🌭','🌮','🍣','🍜','🎂','🍰','🍩','🍪','☕','🍵','🍺','🍷'],
  },
  {
    label: '交通',
    items: ['🚗','🚕','🚌','🚎','🚑','🚒','🚜','✈️','🚀','🛸','🚁','⛵','🚢','🚲','🏍','🚂','🚆','🚉','🏎','🛴','🛵','🚤','🛶','🗺','📍','🏠','🏢','🏥','🏫','🏪','🏛','⛪','🕌'],
  },
]

const PAGE_SIZE = 30

interface Props {
  onSelect: (shortcode: string) => void
}

export function EmojiPickerContent({ onSelect }: Props) {
  const [setIdx, setSetIdx] = useState(0)
  const [counts, setCounts] = useState<number[]>(EMOJI_SETS.map(() => PAGE_SIZE))
  // emojiNameMap: simple name lookup (we use the emoji itself as shortcode, or map to common names)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const visible = useRef(new Set<string>()) // dedup across sets

  const handleSelect = (emoji: string) => {
    // Find a reasonable shortcode — use the emoji itself if no standard name
    onSelect(emoji)
  }

  // Load more when sentinel visible
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setCounts(prev => {
          const next = [...prev]
          next[setIdx] = Math.min(next[setIdx] + PAGE_SIZE, EMOJI_SETS[setIdx].items.length)
          return next
        })
      }
    }, { root: containerRef.current })
    io.observe(el)
    return () => io.disconnect()
  }, [setIdx])

  const currentSet = EMOJI_SETS[setIdx]
  const visibleItems = currentSet.items.slice(0, counts[setIdx])
  const hasMore = visibleItems.length < currentSet.items.length

  return (
    <DropdownMenuContent align="start" className="w-72">
      {/* Category tabs */}
      <div ref={containerRef} className="flex gap-0.5 p-1 border-b overflow-x-auto">
        {EMOJI_SETS.map((set, i) => (
          <button
            key={set.label}
            onClick={() => setSetIdx(i)}
            className={`shrink-0 text-xs px-2 py-1 rounded transition-colors ${
              setIdx === i ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'
            }`}
          >
            {set.label}
          </button>
        ))}
      </div>

      {/* Emoji grid */}
      <div className="max-h-48 overflow-y-auto p-1.5">
        <div className="grid grid-cols-8 gap-0.5">
          {visibleItems.map(emoji => (
            <button
              key={emoji}
              onClick={() => handleSelect(emoji)}
              className="h-8 w-8 flex items-center justify-center text-lg hover:bg-muted rounded cursor-pointer transition-colors"
              title={emoji}
            >
              {emoji}
            </button>
          ))}
        </div>
        {hasMore && <div ref={sentinelRef} className="h-1" />}
      </div>
    </DropdownMenuContent>
  )
}
