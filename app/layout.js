import './globals.css'
import RegisterServiceWorker from './register-sw'

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0d1117',
}

export const metadata = {
  title: '타임 키퍼 v2 - 스마트 스케줄러',
  description: '월간 80시간 근무 관리 및 실시간 팀 공유 시스템',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
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
        <link rel="apple-touch-icon" href="/icon.svg" />
      </head>
      <body>
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  )
}
