import './globals.css'

export const metadata = {
  title: '타임 키퍼 v2 - 스마트 스케줄러',
  description: '월간 80시간 근무 관리 및 실시간 팀 공유 시스템',
}

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
