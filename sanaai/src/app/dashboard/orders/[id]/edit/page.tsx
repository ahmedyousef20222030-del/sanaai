import EditOrderClient from './EditOrderClient'

type Props = { params: Promise<{ id: string }> }

export default async function EditOrderPage({ params }: Props) {
  const { id } = await params
  return <EditOrderClient orderId={id} />
}