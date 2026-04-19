import './globals.css'

export const metadata = {
  title: '타임 키퍼 v2 - 스마트 스케줄러',
  description: '월간 80시간 근무 관리 및 실시간 팀 공유 시스템',
  manifest: '/manifest.json',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no',
  themeColor: '#0d1117',
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
