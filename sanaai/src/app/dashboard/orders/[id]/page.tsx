import OrderDetailClient from './OrderDetailClient'

type Props = { params: Promise<{ id: string }> }

// Server Component wrapper: awaits the dynamic route param (Next.js App
// Router convention used elsewhere in this project, e.g.
// src/app/api/production/[id]/stage/route.ts) and hands a plain string
// down to the client component, which owns all the interactive logic.
export default async function OrderDetailPage({ params }: Props) {
  const { id } = await params
  return <OrderDetailClient id={id} />
}