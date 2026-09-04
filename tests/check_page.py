#!/usr/bin/env python3
from html.parser import HTMLParser
from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[1]
HTML_PATH = ROOT / "index.html"
PAGES_BASE = "https://natalieart.github.io/uncensored-models-guide/"


class HeadParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.meta = {}
        self.links = {}

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "meta":
            key = values.get("property") or values.get("name")
            if key:
                self.meta[key] = values.get("content", "")
        elif tag == "link" and values.get("rel"):
            self.links[values["rel"]] = values.get("href", "")


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def main():
    html = HTML_PATH.read_text(encoding="utf-8")
    parser = HeadParser()
    parser.feed(html)

    require(parser.links.get("canonical") == PAGES_BASE, "canonical must point to the review URL")
    require(parser.meta.get("og:url") == PAGES_BASE, "og:url must point to the review URL")
    expected_image = PAGES_BASE + "assets/og-social.jpg"
    require(parser.meta.get("og:image") == expected_image, "og:image must use the review banner URL")
    require(parser.meta.get("twitter:image") == expected_image, "twitter:image must use the review banner URL")
    require(parser.meta.get("og:image:width") == "1920", "OG image width must match the supplied banner")
    require(parser.meta.get("og:image:height") == "826", "OG image height must match the supplied banner")
    require(parser.meta.get("og:title"), "OG title is required")
    require(parser.meta.get("og:description"), "OG description is required")
    require((ROOT / "assets" / "banner.jpg").is_file(), "banner.jpg is missing")
    require((ROOT / "assets" / "og-social.jpg").is_file(), "og-social.jpg is missing")

    local_refs = re.findall(r'(?:src|href)="(?!https?:|data:|#|mailto:)([^"?]+)', html)
    missing = [ref for ref in local_refs if not (ROOT / ref).resolve().is_file()]
    require(not missing, f"missing local assets: {missing[:5]}")

    require('name="viewport"' in html, "responsive viewport metadata is required")
    require("overflow-x:hidden" in html.replace(" ", ""), "page-level horizontal overflow guard is required")
    require("@media(max-width:560px)" in html.replace(" ", ""), "mobile breakpoint is required")
    require("max-width:100%" in html.replace(" ", ""), "media must be constrained to the viewport")
    compact_css = html.replace(" ", "").replace("\n", "")
    require(
        ".step-card>*{min-width:0}" in compact_css,
        "grid children must be allowed to shrink around wide tables on mobile",
    )

    scroll_script = (ROOT / "assets" / "scroll-canvas.js").read_text(encoding="utf-8")
    mobile_full_frame_guard = (
        "if (!isMobile) { ensureFull(target); ensureFull(target + dir); }"
    )
    require(
        mobile_full_frame_guard in scroll_script,
        "mobile scrolling must keep the portrait preview frames instead of loading centered 16:9 frames",
    )
    require(
        mobile_full_frame_guard in html,
        "the inline scrolling script must preserve the portrait crop on mobile",
    )
    require(
        "var inline = null;" in html,
        "the page must load the corrected external mobile frames instead of stale embedded copies",
    )
    require(
        'data-frame-version="scroll2"' in html,
        "corrected scrolling frames must use a fresh cache version",
    )
    header_resize_guard = "new ResizeObserver(resize).observe(header)"
    require(
        header_resize_guard in scroll_script and header_resize_guard in html,
        "scrolling canvas must resize when the mobile navigation changes height",
    )
    require(
        "v<260" in html,
        "the expanded mobile navigation height must be included above the sticky hero",
    )

    print("PASS: metadata, banner, local assets, and responsive safeguards")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        raise SystemExit(1)
