import OrderDetailClient from './OrderDetailClient'

type Props = { params: Promise<{ id: string }> }

export default async function OrderDetailPage({ params }: Props) {
  const { id } = await params
  return <OrderDetailClient id={id} />
}