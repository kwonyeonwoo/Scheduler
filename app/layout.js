import './globals.css'

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0d1117',
}

export const metadata = {
  title: '타임 키퍼 v2 - 스마트 스케줄러',
  description: '월간 80시간 근무 관리 및 실시간 팀 공유 시스템',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: '타임 키퍼',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <head>
        <link rel="apple-touch-icon" href="https://cdn-icons-png.flaticon.com/512/2088/2088617.png" />
      </head>
      <body>{children}</body>
    </html>
  )
}
