import { Suspense } from 'react'
import OrderDetailClientNew from './OrderDetailClientNew'

type Props = { params: Promise<{ id: string }> }

export default async function OrderDetailPage({ params }: Props) {
  const { id } = await params
  return (
    <Suspense fallback={<div>جاري التحميل...</div>}>
      <OrderDetailClientNew id={id} />
    </Suspense>
  )
}