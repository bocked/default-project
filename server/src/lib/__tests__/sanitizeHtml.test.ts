import { describe, it, expect } from "vitest";
import { sanitizeHtml, sanitizeUrl } from "../sanitizeHtml.js";

describe("sanitizeHtml", () => {
  it("keeps ordinary banner markup intact", () => {
    const html = '<p class="lead">Salom <strong>boshlandi</strong></p><ul><li>Bir</li></ul>';
    expect(sanitizeHtml(html)).toBe(
      '<p class="lead">Salom <strong>boshlandi</strong></p><ul><li>Bir</li></ul>',
    );
  });

  it("keeps inline styles and images", () => {
    const html = '<div style="color:#fff"><img src="/uploads/a.png" alt="a" width="10"></div>';
    expect(sanitizeHtml(html)).toBe(
      '<div style="color:#fff"><img src="/uploads/a.png" alt="a" width="10" /></div>',
    );
  });

  it("removes script elements and their contents", () => {
    expect(sanitizeHtml('<p>ok</p><script>alert(1)</script>')).toBe("<p>ok</p>");
    expect(sanitizeHtml('<script src="//evil.com/x.js"></script>hi')).toBe("hi");
  });

  it("removes other script-bearing containers", () => {
    for (const tag of ["iframe", "object", "embed", "svg", "form", "style", "link", "meta"]) {
      expect(sanitizeHtml(`<${tag}>x</${tag}>`)).not.toContain("<");
    }
    expect(sanitizeHtml('<iframe src="javascript:alert(1)"></iframe>')).toBe("");
  });

  it("strips event handler attributes", () => {
    expect(sanitizeHtml('<p onclick="steal()">hi</p>')).toBe("<p>hi</p>");
    expect(sanitizeHtml('<img src="/a.png" onerror="steal()">')).toBe('<img src="/a.png" />');
    expect(sanitizeHtml("<b ONMOUSEOVER=alert(1)>x</b>")).toBe("<b>x</b>");
  });

  it("drops javascript: and data: URLs but keeps http(s)", () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(sanitizeHtml('<a href="JaVaScRiPt:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(sanitizeHtml('<img src="data:text/html;base64,PHNjcmlwdD4=">')).toBe("<img />");
    expect(sanitizeHtml('<a href="https://ok.uz">x</a>')).toBe(
      '<a href="https://ok.uz" target="_blank" rel="noopener noreferrer">x</a>',
    );
  });

  it("sees through entity- and whitespace-obfuscated schemes", () => {
    expect(sanitizeHtml('<a href="java&#115;cript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(sanitizeHtml('<a href="javascript&colon;alert(1)">x</a>')).toBe("<a>x</a>");
    expect(sanitizeHtml('<a href="  javascript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(sanitizeHtml('<a href="java\tscript:alert(1)">x</a>')).toBe("<a>x</a>");
  });

  it("rejects protocol-relative URLs", () => {
    expect(sanitizeHtml('<a href="//evil.com">x</a>')).toBe("<a>x</a>");
    expect(sanitizeHtml('<img src="//evil.com/p.gif">')).toBe("<img />");
  });

  it("forces safe target/rel on links", () => {
    expect(sanitizeHtml('<a href="/baza" target="_self">x</a>')).toContain('rel="noopener noreferrer"');
  });

  it("drops url() and expression() from style", () => {
    expect(sanitizeHtml('<div style="background:url(javascript:alert(1))">x</div>')).toBe("<div>x</div>");
    expect(sanitizeHtml('<div style="width:expression(alert(1))">x</div>')).toBe("<div>x</div>");
  });

  it("drops unknown attributes and tags but keeps inner text", () => {
    expect(sanitizeHtml('<p formaction="/x" data-evil="1">hi</p>')).toBe("<p>hi</p>");
    expect(sanitizeHtml("<marquee>salom</marquee>")).toBe("salom");
    expect(sanitizeHtml('<custom-tag>salom</custom-tag>')).toBe("salom");
  });

  it("escapes stray angle brackets so no partial tag survives", () => {
    expect(sanitizeHtml("<p>a < b</p>")).toBe("<p>a &lt; b</p>");
    expect(sanitizeHtml('a <script b')).toBe("a &lt;script b");
  });

  it("removes comments (conditional-comment smuggling)", () => {
    expect(sanitizeHtml("<!--[if IE]><script>alert(1)</script><![endif]--><p>x</p>")).toBe("<p>x</p>");
  });

  it("is idempotent", () => {
    const dirty = '<p style="color:red" onclick="x()">a</p><script>b</script><a href="javascript:c">d</a>';
    const once = sanitizeHtml(dirty);
    expect(sanitizeHtml(once)).toBe(once);
  });

  it("handles non-string input", () => {
    expect(sanitizeHtml(undefined)).toBe("");
    expect(sanitizeHtml(null)).toBe("");
    expect(sanitizeHtml(42)).toBe("");
    expect(sanitizeHtml({})).toBe("");
  });
});

describe("sanitizeUrl", () => {
  it("allows http(s), mailto, tel, relative and hash links", () => {
    expect(sanitizeUrl("https://ok.uz/x")).toBe("https://ok.uz/x");
    expect(sanitizeUrl("http://ok.uz")).toBe("http://ok.uz");
    expect(sanitizeUrl("mailto:a@b.uz")).toBe("mailto:a@b.uz");
    expect(sanitizeUrl("tel:+998901234567")).toBe("tel:+998901234567");
    expect(sanitizeUrl("/baza/1")).toBe("/baza/1");
    expect(sanitizeUrl("#anchor")).toBe("#anchor");
    expect(sanitizeUrl("page/2")).toBe("page/2");
  });

  it("rejects executable and protocol-relative URLs", () => {
    expect(sanitizeUrl("javascript:alert(1)")).toBe("");
    expect(sanitizeUrl("JavaScript:alert(1)")).toBe("");
    expect(sanitizeUrl(" javascript:alert(1)")).toBe("");
    expect(sanitizeUrl("data:text/html,<script>alert(1)</script>")).toBe("");
    expect(sanitizeUrl("//evil.com")).toBe("");
    expect(sanitizeUrl("vbscript:msgbox(1)")).toBe("");
    expect(sanitizeUrl("file:///etc/passwd")).toBe("");
  });

  it("trims and rejects non-strings", () => {
    expect(sanitizeUrl("  https://ok.uz  ")).toBe("https://ok.uz");
    expect(sanitizeUrl("   ")).toBe("");
    expect(sanitizeUrl("")).toBe("");
    expect(sanitizeUrl(undefined)).toBe("");
    expect(sanitizeUrl(null)).toBe("");
    expect(sanitizeUrl(123)).toBe("");
  });
});