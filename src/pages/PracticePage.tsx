import { PracticeSession } from '@/components/practice/PracticeSession'
import { useT } from '@/i18n/use-t'

export function Component() {
 const { t } = useT()
 return (
 <div className="">
 <PracticeSession />
 </div>
 )
}
