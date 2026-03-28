"""
Launch 5 deep research queries in parallel across different AI providers.

Usage:
  1. Set API keys in .env or as environment variables
  2. python run-deep-research.py

Results saved to: ryan_cole/insiderbuying-planning/research-results/
"""

import os
import json
import time
import threading
from pathlib import Path

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).parent
PROMPT_FILE = SCRIPT_DIR / "DEEP-RESEARCH-CONTENT-QUALITY.md"
OUTPUT_DIR = SCRIPT_DIR / "research-results"
OUTPUT_DIR.mkdir(exist_ok=True)

# Read prompt (everything after the --- separator)
raw = PROMPT_FILE.read_text(encoding="utf-8")
separator = "\n---\n"
if separator in raw:
    PROMPT = raw.split(separator, 1)[1].strip()
else:
    PROMPT = raw.strip()

print(f"Prompt loaded: {len(PROMPT)} chars")

# ---------------------------------------------------------------------------
# API Keys — from env vars
# ---------------------------------------------------------------------------
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY") or os.environ.get("VITE_GEMINI_API_KEY", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
PERPLEXITY_API_KEY = os.environ.get("PERPLEXITY_API_KEY", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

results = {}
errors = {}

# ---------------------------------------------------------------------------
# 1. Gemini Flash-Lite + Google Search
# ---------------------------------------------------------------------------
def run_gemini_lite():
    """Gemini 2.5 Flash-Lite with Google Search grounding (~$0.01)"""
    if not GEMINI_API_KEY:
        errors["gemini-lite"] = "GEMINI_API_KEY not set"
        return

    try:
        import urllib.request

        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"

        payload = {
            "contents": [{"parts": [{"text": PROMPT}]}],
            "tools": [{"google_search": {}}],
            "generationConfig": {
                "temperature": 0.3,
                "maxOutputTokens": 65536,
            }
        }

        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})

        print("[gemini-lite] Starting...")
        start = time.time()
        with urllib.request.urlopen(req, timeout=600) as resp:
            body = json.loads(resp.read().decode("utf-8"))

        elapsed = time.time() - start

        # Extract text from response
        text_parts = []
        for candidate in body.get("candidates", []):
            for part in candidate.get("content", {}).get("parts", []):
                if "text" in part:
                    text_parts.append(part["text"])

        result_text = "\n".join(text_parts)
        usage = body.get("usageMetadata", {})

        out_path = OUTPUT_DIR / "01-gemini-flash-lite.md"
        out_path.write_text(
            f"# Research: Gemini 2.5 Flash-Lite + Google Search\n\n"
            f"**Model**: gemini-2.5-flash-lite-preview-06-17\n"
            f"**Time**: {elapsed:.1f}s\n"
            f"**Tokens**: input={usage.get('promptTokenCount', '?')}, output={usage.get('candidatesTokenCount', '?')}\n\n"
            f"---\n\n{result_text}\n",
            encoding="utf-8"
        )
        results["gemini-lite"] = f"OK ({elapsed:.0f}s, {len(result_text)} chars)"
        print(f"[gemini-lite] Done in {elapsed:.0f}s")

    except Exception as e:
        errors["gemini-lite"] = str(e)
        print(f"[gemini-lite] ERROR: {e}")


# ---------------------------------------------------------------------------
# 2. Gemini Flash + Google Search
# ---------------------------------------------------------------------------
def run_gemini_flash():
    """Gemini 2.5 Flash with Google Search grounding (~$0.05)"""
    if not GEMINI_API_KEY:
        errors["gemini-flash"] = "GEMINI_API_KEY not set"
        return

    try:
        import urllib.request

        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"

        payload = {
            "contents": [{"parts": [{"text": PROMPT}]}],
            "tools": [{"google_search": {}}],
            "generationConfig": {
                "temperature": 0.3,
                "maxOutputTokens": 65536,
            }
        }

        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})

        print("[gemini-flash] Starting...")
        start = time.time()
        with urllib.request.urlopen(req, timeout=600) as resp:
            body = json.loads(resp.read().decode("utf-8"))

        elapsed = time.time() - start

        text_parts = []
        for candidate in body.get("candidates", []):
            for part in candidate.get("content", {}).get("parts", []):
                if "text" in part:
                    text_parts.append(part["text"])

        result_text = "\n".join(text_parts)
        usage = body.get("usageMetadata", {})

        out_path = OUTPUT_DIR / "02-gemini-flash.md"
        out_path.write_text(
            f"# Research: Gemini 2.5 Flash + Google Search\n\n"
            f"**Model**: gemini-2.5-flash-preview-05-20\n"
            f"**Time**: {elapsed:.1f}s\n"
            f"**Tokens**: input={usage.get('promptTokenCount', '?')}, output={usage.get('candidatesTokenCount', '?')}\n\n"
            f"---\n\n{result_text}\n",
            encoding="utf-8"
        )
        results["gemini-flash"] = f"OK ({elapsed:.0f}s, {len(result_text)} chars)"
        print(f"[gemini-flash] Done in {elapsed:.0f}s")

    except Exception as e:
        errors["gemini-flash"] = str(e)
        print(f"[gemini-flash] ERROR: {e}")


# ---------------------------------------------------------------------------
# 3. OpenAI gpt-4.1-mini + Web Search
# ---------------------------------------------------------------------------
def run_openai():
    """GPT-4.1-mini with web search tool (~$1.70-4.00)"""
    if not OPENAI_API_KEY:
        errors["openai"] = "OPENAI_API_KEY not set"
        return

    try:
        import urllib.request

        url = "https://api.openai.com/v1/responses"

        payload = {
            "model": "gpt-4.1-mini",
            "input": PROMPT,
            "tools": [{"type": "web_search_preview"}],
            "temperature": 0.3,
        }

        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {OPENAI_API_KEY}",
        })

        print("[openai] Starting...")
        start = time.time()
        with urllib.request.urlopen(req, timeout=600) as resp:
            body = json.loads(resp.read().decode("utf-8"))

        elapsed = time.time() - start

        # Extract text from response output
        result_text = ""
        for item in body.get("output", []):
            if item.get("type") == "message":
                for content in item.get("content", []):
                    if content.get("type") == "output_text":
                        result_text += content.get("text", "")

        usage = body.get("usage", {})

        out_path = OUTPUT_DIR / "03-openai-gpt41mini.md"
        out_path.write_text(
            f"# Research: GPT-4.1-mini + Web Search\n\n"
            f"**Model**: gpt-4.1-mini\n"
            f"**Time**: {elapsed:.1f}s\n"
            f"**Tokens**: input={usage.get('input_tokens', '?')}, output={usage.get('output_tokens', '?')}\n\n"
            f"---\n\n{result_text}\n",
            encoding="utf-8"
        )
        results["openai"] = f"OK ({elapsed:.0f}s, {len(result_text)} chars)"
        print(f"[openai] Done in {elapsed:.0f}s")

    except Exception as e:
        errors["openai"] = str(e)
        print(f"[openai] ERROR: {e}")


# ---------------------------------------------------------------------------
# 4. Perplexity sonar-deep-research
# ---------------------------------------------------------------------------
def run_perplexity():
    """Perplexity sonar-deep-research (~$0.50-0.90)"""
    if not PERPLEXITY_API_KEY:
        errors["perplexity"] = "PERPLEXITY_API_KEY not set"
        return

    try:
        import urllib.request

        url = "https://api.perplexity.ai/chat/completions"

        payload = {
            "model": "sonar-deep-research",
            "messages": [
                {"role": "user", "content": PROMPT}
            ],
            "temperature": 0.3,
        }

        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {PERPLEXITY_API_KEY}",
        })

        print("[perplexity] Starting...")
        start = time.time()
        with urllib.request.urlopen(req, timeout=600) as resp:
            body = json.loads(resp.read().decode("utf-8"))

        elapsed = time.time() - start

        result_text = ""
        for choice in body.get("choices", []):
            msg = choice.get("message", {})
            result_text += msg.get("content", "")

        citations = body.get("citations", [])
        usage = body.get("usage", {})

        citations_text = ""
        if citations:
            citations_text = "\n\n## Sources\n" + "\n".join(f"- {c}" for c in citations)

        out_path = OUTPUT_DIR / "04-perplexity-deep.md"
        out_path.write_text(
            f"# Research: Perplexity Sonar Deep Research\n\n"
            f"**Model**: sonar-deep-research\n"
            f"**Time**: {elapsed:.1f}s\n"
            f"**Tokens**: input={usage.get('prompt_tokens', '?')}, output={usage.get('completion_tokens', '?')}\n"
            f"**Citations**: {len(citations)}\n\n"
            f"---\n\n{result_text}{citations_text}\n",
            encoding="utf-8"
        )
        results["perplexity"] = f"OK ({elapsed:.0f}s, {len(result_text)} chars, {len(citations)} citations)"
        print(f"[perplexity] Done in {elapsed:.0f}s")

    except Exception as e:
        errors["perplexity"] = str(e)
        print(f"[perplexity] ERROR: {e}")


# ---------------------------------------------------------------------------
# 5. Claude Opus 4.6
# ---------------------------------------------------------------------------
def run_claude():
    """Claude Opus 4.6 — deep reasoning (~$1.58)"""
    if not ANTHROPIC_API_KEY:
        errors["claude"] = "ANTHROPIC_API_KEY not set"
        return

    try:
        import urllib.request

        url = "https://api.anthropic.com/v1/messages"

        payload = {
            "model": "claude-opus-4-20250514",
            "max_tokens": 16384,
            "temperature": 0.3,
            "messages": [
                {"role": "user", "content": PROMPT}
            ],
        }

        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers={
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
        })

        print("[claude] Starting...")
        start = time.time()
        with urllib.request.urlopen(req, timeout=600) as resp:
            body = json.loads(resp.read().decode("utf-8"))

        elapsed = time.time() - start

        result_text = ""
        for block in body.get("content", []):
            if block.get("type") == "text":
                result_text += block.get("text", "")

        usage = body.get("usage", {})

        out_path = OUTPUT_DIR / "05-claude-opus.md"
        out_path.write_text(
            f"# Research: Claude Opus 4.6\n\n"
            f"**Model**: claude-opus-4-6-20250626\n"
            f"**Time**: {elapsed:.1f}s\n"
            f"**Tokens**: input={usage.get('input_tokens', '?')}, output={usage.get('output_tokens', '?')}\n\n"
            f"---\n\n{result_text}\n",
            encoding="utf-8"
        )
        results["claude"] = f"OK ({elapsed:.0f}s, {len(result_text)} chars)"
        print(f"[claude] Done in {elapsed:.0f}s")

    except Exception as e:
        errors["claude"] = str(e)
        print(f"[claude] ERROR: {e}")


# ---------------------------------------------------------------------------
# Main — launch all 5 in parallel
# ---------------------------------------------------------------------------
def main():
    print("=" * 60)
    print("DEEP RESEARCH: 5 AI providers in parallel")
    print("=" * 60)
    print()

    # Check API keys
    keys = {
        "GEMINI_API_KEY": bool(GEMINI_API_KEY),
        "OPENAI_API_KEY": bool(OPENAI_API_KEY),
        "PERPLEXITY_API_KEY": bool(PERPLEXITY_API_KEY),
        "ANTHROPIC_API_KEY": bool(ANTHROPIC_API_KEY),
    }

    for k, v in keys.items():
        status = "OK" if v else "MISSING"
        print(f"  {k}: {status}")

    missing = [k for k, v in keys.items() if not v]
    if missing:
        print(f"\nWARNING: {len(missing)} API key(s) missing. Those providers will be skipped.")
        print(f"Set them as environment variables before running.\n")

    print(f"\nOutput directory: {OUTPUT_DIR}")
    print(f"Launching all providers...\n")

    start_all = time.time()

    threads = [
        threading.Thread(target=run_gemini_lite, name="gemini-lite"),
        threading.Thread(target=run_gemini_flash, name="gemini-flash"),
        threading.Thread(target=run_openai, name="openai"),
        threading.Thread(target=run_perplexity, name="perplexity"),
        threading.Thread(target=run_claude, name="claude"),
    ]

    for t in threads:
        t.start()

    for t in threads:
        t.join(timeout=660)

    elapsed_all = time.time() - start_all

    print()
    print("=" * 60)
    print(f"ALL DONE in {elapsed_all:.0f}s")
    print("=" * 60)
    print()

    print("Results:")
    for name, status in results.items():
        print(f"  {name}: {status}")

    if errors:
        print("\nErrors:")
        for name, err in errors.items():
            print(f"  {name}: {err}")

    print(f"\nOutput files in: {OUTPUT_DIR}/")
    for f in sorted(OUTPUT_DIR.glob("*.md")):
        size = f.stat().st_size
        print(f"  {f.name} ({size:,} bytes)")


if __name__ == "__main__":
    main()
