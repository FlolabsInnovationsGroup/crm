import json
import subprocess
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

WORK = Path(__file__).resolve().parent
FPS = 30
POSTER_T = 35.7


def open_page(p):
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=1)
    page.goto((WORK / "demo.html").as_uri())
    page.evaluate("document.fonts.ready.then(() => Promise.all([...document.images].map(i => i.complete ? 1 : new Promise(r => i.onload = r))))")
    page.wait_for_timeout(400)
    page.evaluate("measure()")
    return browser, page


def stills(times):
    out = WORK / "stills"
    out.mkdir(exist_ok=True)
    with sync_playwright() as p:
        browser, page = open_page(p)
        for t in times:
            page.evaluate(f"render({t})")
            page.screenshot(path=str(out / f"t{t:05.1f}.png"))
        browser.close()


def frames():
    with sync_playwright() as p:
        browser, page = open_page(p)
        duration = page.evaluate("window.DURATION")
        timeline = page.evaluate("({ cues: window.SFX, ...window.TIMELINE })")
        (WORK / "timeline.json").write_text(json.dumps(timeline))
        total = int(duration * FPS)
        ff = subprocess.Popen(
            ["ffmpeg", "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(FPS), "-c:v", "mjpeg", "-i", "-",
             "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "17", "-preset", "medium", "-r", str(FPS), str(WORK / "video.mp4")],
            stdin=subprocess.PIPE,
        )
        for i in range(total):
            t = POSTER_T if i == 0 else i / FPS
            page.evaluate(f"render({t})")
            ff.stdin.write(page.screenshot(type="jpeg", quality=94))
            if i % 300 == 0:
                print(f"frame {i}/{total}", flush=True)
        ff.stdin.close()
        ff.wait()
        page.evaluate(f"render({POSTER_T})")
        page.screenshot(path=str(WORK.parent / "brag.jpg"), type="jpeg", quality=92)
        browser.close()
    print("frames done", flush=True)


if __name__ == "__main__":
    if sys.argv[1] == "stills":
        stills([float(x) for x in sys.argv[2:]])
    else:
        frames()
