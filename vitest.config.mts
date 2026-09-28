import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // session.ts の secretKey() は呼び出し時に process.env.PORTAL_SESSION_SECRET を読む。
    // テスト全体で固定値を与える（本番の鍵ではない）。
    env: {
      PORTAL_SESSION_SECRET: "test-secret-please-ignore",
    },
    coverage: {
      provider: "v8",
      // .tsx（コンポーネント）は対象外。createUiKit()の文字列生成ロジックはテストするが、
      // 同じファイル内のCard/SecondaryButton/Fieldは見た目のみでロジックが無いため、
      // ファイル単位でしか切れないカバレッジの計測対象からは外す。
      include: ["src/**/*.ts"],
    },
  },
});
