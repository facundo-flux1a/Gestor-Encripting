#!/usr/bin/env python3
"""
Take dark mode screenshots using Chrome headless CDP via subprocess + websocket.
Falls back to chrome --screenshot if CDP fails.
"""
import subprocess, os, time, json, threading, sys
from urllib.request import urlopen
from urllib.error import URLError

DARK = "/home/flux1a/.gemini/antigravity/brain/1b5cf952-be2e-438b-b3e0-87f81ad13496/dark"
os.makedirs(DARK, exist_ok=True)

BASE = "http://localhost:9002"
PAGES = [
    ("/dashboard",   "dm_dashboard"),
    ("/documents",   "dm_documents"),
    ("/trimestres",  "dm_trimestres"),
    ("/incidents",   "dm_incidents"),
    ("/proveedores", "dm_proveedores"),
    ("/sii",         "dm_sii"),
]

CHROME = "/usr/bin/google-chrome"
CHROME_PORT = 9222

def start_chrome():
    proc = subprocess.Popen([
        CHROME,
        f"--remote-debugging-port={CHROME_PORT}",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--headless=new",
        "--window-size=1440,900",
        "--hide-scrollbars",
        "about:blank"
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(3)
    return proc

def get_ws_url():
    try:
        data = json.loads(urlopen(f"http://localhost:{CHROME_PORT}/json").read())
        for tab in data:
            if tab.get("type") == "page":
                return tab["webSocketDebuggerUrl"]
    except:
        return None

def cdp_cmd(ws, method, params=None):
    import websocket
    pass  # Will use a simpler approach

# Simpler: use chrome --screenshot for each URL with JS injection via data URI
def take_screenshot_headless(url, out_path):
    """Use chrome headless to navigate, inject dark mode, then screenshot."""
    # We use a data URI trick: navigate to URL, then use CDP via a Python websocket
    # Actually let's just use xvfb + chrome for full JS support
    cmd = [
        CHROME,
        "--no-sandbox",
        "--disable-setuid-sandbox", 
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--headless=new",
        "--window-size=1440,900",
        "--hide-scrollbars",
        "--screenshot=" + out_path,
        "--virtual-time-budget=5000",
        url
    ]
    result = subprocess.run(cmd, capture_output=True, timeout=30)
    return result.returncode == 0

# Strategy: use chrome with a JS snippet injected via --enable-javascript
# We'll use a different approach: take screenshot of page with dark class forced via URL hack

# Actually the cleanest approach without puppeteer: use chrome with a temp HTML file
# that redirects to the page after setting localStorage

def make_redirect_html(target_url, dark=True):
    theme_val = "dark" if dark else "light"
    return f"""<!DOCTYPE html>
<html>
<head><script>
localStorage.setItem('theme', '{theme_val}');
// Also try next-themes key
localStorage.setItem('ui-theme', '{theme_val}');
window.location.href = '{target_url}';
</script></head>
<body></body>
</html>"""

# Write redirect files and take screenshots
TMP_HTML = os.path.join(DARK, "_redirect.html")

print("Starting Chrome headless screenshots...")
print("Note: Using --virtual-time-budget for JS execution\n")

# First: take one screenshot with redirect to set localStorage dark mode
for url_path, name in PAGES:
    full_url = BASE + url_path
    out_path = os.path.join(DARK, name + ".png")
    
    # Write redirect HTML that sets dark theme then redirects
    with open(TMP_HTML, "w") as f:
        f.write(make_redirect_html(full_url, dark=True))
    
    file_url = f"file://{TMP_HTML}"
    
    print(f"📸 {name}...", end=" ", flush=True)
    
    # Use chrome with a longer virtual time budget for redirect + page load
    cmd = [
        CHROME,
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-gpu", 
        "--disable-dev-shm-usage",
        "--headless=new",
        "--window-size=1440,900",
        "--hide-scrollbars",
        "--screenshot=" + out_path,
        "--virtual-time-budget=8000",
        "--run-all-compositor-stages-before-draw",
        file_url
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=30)
        if result.returncode == 0 and os.path.exists(out_path):
            size = os.path.getsize(out_path)
            print(f"✅ ({size//1024}KB)")
        else:
            # Fallback: direct URL without redirect
            print(f"⚠️  redirect failed, trying direct...", end=" ")
            cmd2 = [CHROME, "--no-sandbox", "--disable-setuid-sandbox", 
                    "--disable-gpu", "--disable-dev-shm-usage", "--headless=new",
                    "--window-size=1440,900", "--hide-scrollbars",
                    "--screenshot=" + out_path, "--virtual-time-budget=6000",
                    full_url]
            result2 = subprocess.run(cmd2, capture_output=True, timeout=30)
            if result2.returncode == 0 and os.path.exists(out_path):
                print(f"✅ (direct, {os.path.getsize(out_path)//1024}KB)")
            else:
                print(f"❌ FAILED: {result2.stderr.decode()[:200]}")
    except subprocess.TimeoutExpired:
        print("❌ TIMEOUT")
    except Exception as e:
        print(f"❌ ERROR: {e}")

# Cleanup
if os.path.exists(TMP_HTML):
    os.remove(TMP_HTML)

print(f"\n📁 Dark screenshots saved to: {DARK}")
print("Files:", [f for f in os.listdir(DARK) if f.endswith('.png')])
