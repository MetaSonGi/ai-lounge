# AI라운지 — 현장이 묻고, AI가 돕다

영상과 이미지가 담긴 **한 폴더**를 열면, 컨셉별로 자동 분류되고
**5가지 갤러리 스타일**로 바꿔 볼 수 있는 웹 미디어 라운지.

- 📁 폴더 열기 / 드래그앤드롭 / 데모 체험 — 영상(mp4·webm·mov) + 이미지(jpg·png·webp·gif)
- 💬 "현장이 묻다" 질문 박스 — 오프라인 키워드 큐레이션 기본, Gemini API 키가 있으면 AI 큐레이션
- 🎨 갤러리 5종 전환: 그리드 · 매서너리 · 필름스트립 · 3D 월 · 시네마
- 🏷️ 파일명 기반 자동 컨셉 태깅 (로봇·자동화 / 물류·컨베이어 / 데이터·대시보드 / 작업자·AR / 용접·가공 / 야간·전경 / 제어·PLC)

## 실행

정적 사이트라 서버가 필요 없습니다. `index.html`을 브라우저로 열거나,
GitHub Pages에 올리면 바로 동작합니다.

라이브: https://metasongi.github.io/ai-lounge/

## AI 큐레이션 (선택)

우측 상단 ⚙️ 설정에서 Gemini API 키를 입력하면
"현장이 묻다" 질문에 AI가 컨셉 제목·설명·선별 이유를 달아 큐레이션합니다.
키 없이도 오프라인 키워드 매칭으로 동작합니다. 키는 브라우저 localStorage에만 저장됩니다.
키 발급: https://aistudio.google.com/apikey

## 구조

```
ai-lounge/
├── index.html          # UI 셸
├── css/style.css       # 다크 라운지 테마
├── js/app.js           # 폴더 로드·태깅·큐레이션·갤러리 5종
├── assets/demo/        # 데모 미디어 9종 + manifest.json
└── docs/plan.md        # 기획 · 유저플로우 · 디자인 문서
```

## 기획 문서

`docs/plan.md`에 기획·유저플로우·디자인이 정리되어 있습니다.
