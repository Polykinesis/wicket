import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { readVisitorPage } from "../src/page-context.ts";

const user = (metadata: unknown): UIMessage => ({
  id: "m1",
  role: "user",
  parts: [{ type: "text", text: "Can I pause?" }],
  metadata,
});

describe("readVisitorPage", () => {
  it("reads title and path from well-formed metadata", () => {
    expect(
      readVisitorPage(
        user({ page: { url: "https://acme.example.com/pricing", title: " Pricing " } }),
      ),
    ).toEqual({ title: "Pricing", path: "/pricing" });
  });

  it("drops an empty title but keeps the path", () => {
    expect(
      readVisitorPage(user({ page: { url: "https://acme.example.com/", title: "" } })),
    ).toEqual({
      title: null,
      path: "/",
    });
  });

  it("refuses anything that is not the contract", () => {
    for (const metadata of [
      undefined,
      null,
      {},
      { page: null },
      { page: { url: "javascript:alert(1)", title: "x" } },
      { page: { url: "https://acme.example.com/a?session=abc", title: "x" } },
      { page: { url: "https://acme.example.com/a#frag", title: "x" } },
      { page: { url: "https://acme.example.com/a", title: "x".repeat(201) } },
      { page: { url: "https://acme.example.com/a" } },
      "https://acme.example.com/a",
    ]) {
      expect(readVisitorPage(user(metadata)), JSON.stringify(metadata)).toBeNull();
    }
  });

  it("ignores assistant messages and a missing message", () => {
    const assistant: UIMessage = {
      id: "a1",
      role: "assistant",
      parts: [],
      metadata: { page: { url: "https://acme.example.com/a", title: "x" } },
    };
    expect(readVisitorPage(assistant)).toBeNull();
    expect(readVisitorPage(undefined)).toBeNull();
  });
});
