import { useState, useEffect, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { supabase } from '@/lib/supabase'
import { ImagePlus, Library, Loader2, X } from 'lucide-react'
import type { QuestionBank } from '@/hooks/use-question-banks'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: { name: string; description?: string; logo_url?: string; is_public?: boolean }) => Promise<void>
  initialData?: QuestionBank | null
}

export function BankDialog({ open, onOpenChange, onSave, initialData }: Props) {
  const [name, setName] = useState(initialData?.name ?? '')
  const [description, setDescription] = useState(initialData?.description ?? '')
  const [logoUrl, setLogoUrl] = useState(initialData?.logo_url ?? '')
  const [isPublic, setIsPublic] = useState(initialData?.is_public ?? false)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const isEdit = !!initialData

  // Sync form state when dialog opens with new initialData
  useEffect(() => {
    if (open && initialData) {
      setName(initialData.name ?? '')
      setDescription(initialData.description ?? '')
      setLogoUrl(initialData.logo_url ?? '')
      setIsPublic(initialData.is_public ?? false)
    } else if (open) {
      setName('')
      setDescription('')
      setLogoUrl('')
      setIsPublic(false)
    }
  }, [open, initialData?.id])

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && saving) return
    onOpenChange(newOpen)
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('folder', 'bank-logos')
      const { data, error } = await supabase.functions.invoke('r2-upload', { body: formData })
      if (error) {
        console.error('Logo upload failed:', error)
        alert('Logo 上传失败: ' + (error.message || '未知错误'))
      } else if (data?.url) {
        setLogoUrl(data.url as string)
      } else {
        alert('Logo 上传失败: 未返回图片地址')
      }
    } catch (err) {
      console.error('Logo upload error:', err)
      alert('Logo 上传出错')
    }
    setUploading(false)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        logo_url: logoUrl || undefined,
        is_public: isPublic,
      })
      onOpenChange(false)
    } catch { /* ignore */ }
    setSaving(false)
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogTitle>{isEdit ? '编辑试题库' : '创建试题库'}</AlertDialogTitle>
        <AlertDialogDescription>
          {isEdit ? '修改试题库的基本信息。' : '创建一个新的试题库，之后可以从题库中添加题目。'}
        </AlertDialogDescription>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="bank-name">名称</Label>
            <Input id="bank-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="试题库名称" autoFocus required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bank-desc">简介</Label>
            <Textarea id="bank-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="简单描述这个试题库..." rows={2} />
          </div>

          <div className="space-y-2">
            <Label>Logo</Label>
            {logoUrl ? (
              <LogoPreview url={logoUrl} onRemove={() => setLogoUrl('')} />
            ) : (
              <label className="flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border p-4 cursor-pointer hover:border-primary/40 hover:bg-accent/30 transition-colors">
                <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                {uploading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : (
                  <ImagePlus className="h-5 w-5 text-muted-foreground" />
                )}
                <span className="text-xs text-muted-foreground">{uploading ? '上传中...' : '点击上传 Logo'}</span>
              </label>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm">公开试题库</p>
              <p className="text-xs text-muted-foreground">其他用户可以看到和使用</p>
            </div>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <AlertDialogCancel asChild>
              <Button variant="outline" size="sm" type="button" disabled={saving}>取消</Button>
            </AlertDialogCancel>
            <Button type="submit" size="sm" disabled={saving || !name.trim()}>
              {saving ? '保存中...' : isEdit ? '保存修改' : '创建'}
            </Button>
          </div>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function LogoPreview({ url, onRemove }: { url: string; onRemove: () => void }) {
  const [errored, setErrored] = useState(false)
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg border bg-muted/30">
      {errored ? (
        <div className="h-16 w-16 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Library className="h-6 w-6 text-primary/60" />
        </div>
      ) : (
        <img src={url} alt="Logo" className="h-16 w-16 rounded-lg object-cover shrink-0 border" onError={() => setErrored(true)} />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">Logo 已上传</p>
        <p className="text-[10px] text-muted-foreground">点击右侧按钮可移除重新上传</p>
      </div>
      <Button type="button" variant="ghost" size="icon" className="shrink-0 hover:bg-destructive/10 hover:text-destructive" onClick={onRemove}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}
