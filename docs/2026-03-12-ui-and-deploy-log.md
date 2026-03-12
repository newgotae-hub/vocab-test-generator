# 2026-03-12 UI And Deploy Log

## 범위

2026년 3월 12일에 진행한 랜딩, 블로그, 공개 네비게이션, 보호 페이지 브랜드 링크, 자동 배포 관련 작업을 정리한 문서다.

## 현재 기준 상태

### 1. 랜딩페이지

관련 파일:

- `index.html`
- `src/pages/landing.js`
- `oxbridge-partners-black-on-white.svg`

적용된 상태:

- 헤더에서 `홈` 링크를 제거했다.
- 헤더 중앙에 `oxbridge-partners` 로고를 배치했다.
- 히어로의 구매 CTA를 다시 `구매하기`로 복구했고, 클릭 시 `곧 출시됩니다!` 알림이 뜨도록 되돌렸다.
- 히어로에 임시로 들어갔던 점 배경과 랜딩 블로그 미리보기 섹션을 제거했다.
- 푸터 중앙에 `oxbridge-partners` 로고를 배치했다.
- 푸터 상단 여백을 줄였다.
- 푸터 우측에 `Designed and Developed by Juntae Ko (고준태)` 문구를 복구했다.
- `oxbridge-partners` 로고 SVG에서 흰 배경 `rect`를 제거해서 투명 배경으로 맞췄다.

### 2. 블로그 페이지

관련 파일:

- `blog/index.html`
- `src/pages/blog.js`

적용된 상태:

- 공개 헤더에서 `홈`, `저자` 링크를 제거했다.
- 블로그 글 목록이 페이지 가장 위에서 바로 보이도록 구조를 단순화했다.
- 상단 소개 문구와 `글 목록`, `글 N개` 카운트 표시를 제거했다.
- 글 제목을 누르면 페이지 이동 없이 그 자리에서 내용이 펼쳐지는 아코디언 구조로 바꿨다.
- 별도 상세 본문 영역으로 스크롤 이동시키던 방식은 제거했다.
- 블로그 헤더 중앙에도 랜딩과 같은 `oxbridge-partners` 로고를 배치했다.
- 블로그 푸터도 랜딩과 같은 구조로 추가했다.
- 관리자 작성기에서 본문 이미지 드래그 앤 드롭 업로드를 지원하도록 확장했다.
- 본문에 삽입한 이미지는 실시간 미리보기와 공개 글 렌더링에 반영되도록 바꿨다.
- 첫 진입 시 fallback 글을 먼저 보여주고, 실제 데이터는 뒤에서 갱신하는 방식으로 초기 로딩 체감을 줄였다.

### 3. 저자 페이지

관련 파일:

- `author/index.html`

적용된 상태:

- 공개 헤더에서 `홈`, `저자` 링크를 제거했다.
- 현재는 `블로그`, `로그인`만 남아 있다.
- 저자 페이지 하단에도 랜딩/블로그/contact와 같은 최신 푸터를 추가했다.

### 4. 로그인 후 보호 페이지

관련 파일:

- `dashboard/index.html`
- `generator/index.html`
- `test/index.html`
- `cards/index.html`
- `ranked/index.html`
- `stats/index.html`
- `game/index.html`
- `mypage/index.html`

적용된 상태:

- 브랜드 영역의 클릭 경로를 `/dashboard/`가 아니라 랜딩 `/`로 바꾸었다.
- 브랜드 아이콘은 제거했다가 다시 복구했다.
- 결과적으로 현재는 `아이콘 + 평가원기출VOCA` 조합을 유지하면서 클릭 시 랜딩으로 이동한다.

### 5. 배포 체인

관련 파일:

- `.github/workflows/deploy-cloudflare-pages.yml`
- `scripts/prepare_cloudflare_pages.sh`

적용된 상태:

- `main` 브랜치 푸시 시 Cloudflare Pages로 자동 배포되도록 워크플로를 복구했다.
- Pages 번들 준비 스크립트가 실제 배포 자산을 포함하도록 정리했다.
- `oxbridge-partners-black-on-white.svg`도 배포 번들에 포함되도록 추가했다.

### 6. Contact 페이지

관련 파일:

- `contact/index.html`

적용된 상태:

- 공개 푸터의 편지 아이콘이 `/contact/`로 이동하도록 연결했다.
- 새 `contact` 페이지를 추가했다.
- `Instagram DM`과 `서비스 피드백` 두 개의 기본 문의 채널 블록을 배치했다.
- `서비스 피드백` 카드에서 Userback 위젯을 직접 열 수 있는 버튼을 연결했다.
- 버튼을 Userback 로드 완료 전 눌러도, 준비가 끝나는 즉시 열리도록 pending-open 처리를 추가했다.

## 중간에 시도했다가 롤백된 변경

- 랜딩페이지 하단에 `oxbridge-partners` 로고를 별도 추가 블록으로 붙인 버전
- 랜딩 히어로 안에 큰 로고를 직접 노출한 버전
- 랜딩 푸터 연도를 `2024`로 되돌린 변경
- 랜딩페이지 블로그 미리보기 카드 섹션
- 블로그 우측 사이드바형 구조와 상단 소개 블록

현재 화면은 위 시도들을 다시 정리한 뒤 확정한 상태다.

## 관련 커밋 흐름

중요 커밋:

- `22b8e95` `fix: align landing header with public pages`
- `5ffea69` `Refine blog navigation and inline post layout`
- `3ec0129` `Remove protected-page brand icon`
- `3fcf9f3` `Restore brand icon and add Pages deploy workflow`
- `e00c4a1` `Remove landing blog preview section`
- `951f602` `Restore landing hero purchase CTA`
- `6351a29` `Add Oxbridge Partners footer logo`
- `2618a81` `Center footer brand lockup`
- `ec88041` `Revert "Center footer brand lockup"`
- `91167c8` `Revert "Add Oxbridge Partners footer logo"`
- `08e3b1b` `Simplify landing footer credits`
- `2877eac` `Restore original landing footer year`
- `da03733` `Revert "Restore original landing footer year"`
- `e5c11eb` `Place landing logo at top and bottom center`
- `669d761` `Place Oxbridge logo in landing chrome`
- `eda74a5` `Make Oxbridge logo background transparent`
- `2d3ce05` `Adjust landing footer spacing and credits`
- `9789edc` `Align blog chrome with landing branding`
- `e39b794` `Add blog body image drag-and-drop uploads`
- `05076b6` `Add public contact page`
- `d276868` `Wire contact feedback card to Userback`
- `0691f10` `Use basic Userback open on contact page`
- `ec6c958` `Queue Userback open on contact button`
- `5ae7282` `Move footer credit text to left column`

## 현재 미반영 요청

- 블로그 관리자 글쓰기 화면을 `Notion`처럼 완전한 블록 기반 편집기로 바꾸는 작업
- 이미지 크기 조절, 위치 조정, 자유 편집

현재 블로그 작성기는 드래그 앤 드롭 이미지 업로드와 미리보기까지는 지원하지만, 아직 완전한 블록 에디터는 아니다.

## 작업 시 주의사항

- `README.md`는 현재 별도 수정 사항이 있으므로 이 문서 작업에서 건드리지 않았다.
- `output/` 디렉터리도 이번 문서 작업 범위에 포함하지 않았다.
- 자동 배포는 `main` 푸시 기준이다.
