import { describe, expect, it } from "vitest";

import { htmlCode, htmlEscape, htmlPre } from "../../src/utils/htmlEscape.js";

describe("htmlEscape", () => {
  it("returns empty string unchanged", () => {
    expect(htmlEscape("")).toBe("");
  });

  it("escapes ampersands first", () => {
    expect(htmlEscape("&")).toBe("&amp;");
  });

  it("escapes less-than", () => {
    expect(htmlEscape("<")).toBe("&lt;");
  });

  it("escapes greater-than", () => {
    expect(htmlEscape("> ")).toBe("&gt; ");
  });

  it("escapes double quotes", () => {
    expect(htmlEscape('"quoted"')).toBe("&quot;quoted&quot;");
  });

  it("escapes mixed html-looking content", () => {
    expect(htmlEscape("<b>&amp;</b>")).toBe("&lt;b&gt;&amp;amp;&lt;/b&gt;");
  });

  it("passes emoji through", () => {
    expect(htmlEscape("hello 😀")).toBe("hello 😀");
  });

  it("passes control chars through", () => {
    expect(htmlEscape("a\nb\t c")).toBe("a\nb\t c");
  });

  it("wraps escaped content in code tags", () => {
    expect(htmlCode("<tag>&")).toBe("<code>&lt;tag&gt;&amp;</code>");
  });

  it("wraps escaped content in pre tags", () => {
    expect(htmlPre('"x"')).toBe("<pre>&quot;x&quot;</pre>");
  });
});
