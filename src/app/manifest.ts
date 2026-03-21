import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Voca Atelier",
    short_name: "Voca",
    description: "교재 DB를 카드 학습, 퀴즈, 검색 라이브러리로 연결한 보카 학습 앱",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f0e8",
    theme_color: "#f5f0e8",
    lang: "ko-KR",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
