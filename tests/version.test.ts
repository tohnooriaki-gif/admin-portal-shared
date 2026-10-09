import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// タグを切るときにpackage.jsonのversionを上げ忘れないための確認（git・ネットワークには触れない）。
// 理由: 各アプリのNext.js(webpack)のビルドキャッシュは、node_modules内のパッケージを「versionが同じなら
// 中身も同じ」とみなす。タグを上げてもversionが同じだと、古いキャッシュが使われ、新旧のファイルが
// 食い違って本番で落ちる（2026-10-08の障害）。タグ名はvN / vN.M、versionはN.0.0 / N.M.0に対応させる。

const read = (name: string) => readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), "utf8");

const pkg = JSON.parse(read("package.json")) as { version: string };
const lock = JSON.parse(read("package-lock.json")) as { version: string; packages: Record<string, { version: string }> };
const changelog = read("CHANGELOG.md");
const readme = read("README.md");

const toVersion = (major: number, minor: number) => `${major}.${minor}.0`;

// CHANGELOGの`**`vN.M`**`（タグ管理対象の項目）のうち最大のもの
function latestChangelogTag(): { major: number; minor: number; name: string } {
  const tags = [...changelog.matchAll(/\*\*`v(\d+)(?:\.(\d+))?`\*\*/g)].map((m) => ({
    major: Number(m[1]),
    minor: Number(m[2] ?? 0),
    name: `v${m[1]}${m[2] !== undefined ? `.${m[2]}` : ""}`,
  }));
  expect(tags.length).toBeGreaterThan(0);
  return tags.reduce((a, b) => (b.major > a.major || (b.major === a.major && b.minor > a.minor) ? b : a));
}

describe("バージョン（タグとpackage.jsonのversionの対応）", () => {
  it("versionはN.M.0の形（タグvN.M → N.M.0、vN → N.0.0）", () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.0$/);
  });

  it("package.jsonのversionが、CHANGELOGにある最新のタグに対応している（上げ忘れ防止）", () => {
    const t = latestChangelogTag();
    expect(
      pkg.version,
      `package.jsonのversion(${pkg.version})とCHANGELOGの最新のタグ(${t.name})が対応していない。versionを${toVersion(t.major, t.minor)}にするか、CHANGELOGに${t.name}より新しいタグの項目を書くこと`
    ).toBe(toVersion(t.major, t.minor));
  });

  it("package-lock.jsonのversionもpackage.jsonと同じ", () => {
    expect(lock.version).toBe(pkg.version);
    expect(lock.packages[""].version).toBe(pkg.version);
  });

  it("READMEの使い方の例のタグが、最新のタグと同じ", () => {
    const m = readme.match(/admin-portal-shared\.git#(v[\d.]+)"/);
    expect(m, "READMEに`git+https://...admin-portal-shared.git#vX.Y`の例が見つからない").not.toBeNull();
    expect(m![1]).toBe(latestChangelogTag().name);
  });
});
