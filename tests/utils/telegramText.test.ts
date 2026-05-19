import { describe, expect, it, vi } from "vitest";

import {
  shouldSendAsDocument,
  splitForTelegram,
} from "../../src/utils/telegramText.js";

describe("splitForTelegram", () => {
  it("returns a single chunk for short text", () => {
    expect(splitForTelegram("hello world")).toEqual(["hello world"]);
  });

  it("splits long plain text into multiple chunks", () => {
    expect(splitForTelegram("line1\nline2\nline3", 10)).toEqual([
      "line1",
      "line2",
      "line3",
    ]);
  });

  it("keeps a pre block intact", () => {
    expect(splitForTelegram("intro\n<pre>abc\ndef\nxyz</pre>\noutro", 12)).toEqual([
      "intro",
      "<pre>abc\ndef\nxyz</pre>",
      "outro",
    ]);
  });

  it("logs when a pre block exceeds max", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(splitForTelegram("<pre>abcdefgh</pre>", 5)).toEqual(["<pre>abcdefgh</pre>"]);
    expect(spy).toHaveBeenCalledWith(
      "splitForTelegram: <pre> block exceeds max length",
    );

    spy.mockRestore();
  });

  it("respects exact boundary", () => {
    expect(splitForTelegram("12345", 5)).toEqual(["12345"]);
  });

  it("splits a long blob without newlines", () => {
    expect(splitForTelegram("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
  });

  it("uses default max for document decision", () => {
    expect(shouldSendAsDocument("a".repeat(3500))).toBe(false);
    expect(shouldSendAsDocument("a".repeat(3501))).toBe(true);
  });

  it("uses custom max for document decision", () => {
    expect(shouldSendAsDocument("hello", 4)).toBe(true);
  });
});
