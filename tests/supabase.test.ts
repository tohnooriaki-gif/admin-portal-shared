import { describe, it, expect } from "vitest";
import { createServiceClient } from "../src/supabase";

describe("createServiceClient", () => {
  it("urlが無いと例外", () => {
    expect(() => createServiceClient(undefined, "key")).toThrow(/SUPABASE_URL/);
  });

  it("serviceRoleKeyが無いと例外", () => {
    expect(() => createServiceClient("https://example.supabase.co", undefined)).toThrow(/SUPABASE_URL/);
  });

  it("両方指定されればSupabaseClientを返す（ネットワークアクセスはしない）", () => {
    const client = createServiceClient("https://example.supabase.co", "dummy-service-role-key");
    expect(client).toBeTruthy();
    expect(typeof client.from).toBe("function");
  });
});
