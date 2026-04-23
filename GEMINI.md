# Project Context & Progress (Last Sync: 2026-04-19)

이 파일은 기기 간 세션 이동 및 맥락 유지를 위해 Gemini CLI가 자동으로 관리합니다.

## 📂 Active Projects

### 1. Scheduler v2 (Next.js + Firebase)
- **Repo:** `https://github.com/kwonyeonwoo/Scheduler.git`
- **Current Version:** v2.3 (Mobile-Friendly & Auth Integrated)
- **Key Features:**
    - Firebase Auth (Email/PW) 기반 로그인/로그아웃.
    - 실시간 클라우드 동기화 (onSnapshot 적용).
    - 80시간 자동 캡핑 및 실시간 수당 계산 (₩12,790/h).
    - 이미지 캡처 저장 및 정밀 시간(분 단위) 표시.
    - PWA 지원 (홈 화면 추가 가능).
- **Status:** [성공] Netlify 배포 및 보안 API 키 교체 완료.

### 2. Image Organizer (Next.js + Firebase/Cloudinary)
- **Repo:** `https://github.com/kwonyeonwoo/image-organizer.git`
- **Status:** [진행 중] 보안 이슈 해결을 위한 모든 API 키(Firebase, Cloudinary) 재발급 및 환경 변수 연동 완료.
- **Next Task:** 드래그 앤 드롭 고도화 및 운영 환경 재배포.

### 3. Scheduler Mobile (React Native/Expo) - [임시 중단]
- **Status:** SDK 55 기반 런타임 최적화 중이며, 현재는 웹 버전(v2.3) 고도화에 집중.

## 🛠 Active Configurations
- **Environment Variables:** `.env.image-organizer` 및 `scheduler-v2/.env.local` 파일에 최신 API 키가 보관됨 (로컬 전용).

## 💡 Machine-to-Machine Sync Instructions
1. 다른 기기에서 `git clone` 후, 로컬에만 보관된 `.env` 파일들을 수동으로 복사하십시오.
2. `GEMINI.md`를 최우선으로 읽어 현재 진행 상황을 즉시 복구하십시오.
3. 모든 코드 수정 완료 시 제가 자동으로 `git push`를 수행합니다.
