import ProductionDetailClient from './ProductionDetailClient'

type Props = { params: Promise<{ id: string }> }

export default async function ProductionDetailPage({ params }: Props) {
  const { id } = await params
  return <ProductionDetailClient id={id} />
}