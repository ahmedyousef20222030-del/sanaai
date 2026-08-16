import type { Metadata } from 'next'
import './globals.css'
import ImpersonationBanner from '@/components/ImpersonationBanner'

export const metadata: Metadata = {
  title: 'صَنَاعي',
  description: 'نظام إدارة المصانع',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&family=Tajawal:wght@400;700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ fontFamily: "'Cairo', sans-serif" }}>
        <ImpersonationBanner />
        {children}
      </body>
    </html>
  )
}