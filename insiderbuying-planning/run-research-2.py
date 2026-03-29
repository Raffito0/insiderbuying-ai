"""Research 2: Prompt & Workflow Design — 5 AI providers in parallel."""
import os, json, time, threading, urllib.request
from pathlib import Path

PROMPT_FILE = Path(__file__).parent / "DEEP-RESEARCH-PROMPTS-WORKFLOWS.md"
OUTPUT_DIR = Path(__file__).parent / "research-results-r2"
OUTPUT_DIR.mkdir(exist_ok=True)

raw = PROMPT_FILE.read_text(encoding="utf-8")
PROMPT = raw.split("\n---\n", 1)[1].strip()
print(f"Prompt loaded: {len(PROMPT)} chars")

GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "")
OPENAI_KEY = os.environ.get("OPENAI_API_KEY", "")
PPLX_KEY = os.environ.get("PERPLEXITY_API_KEY", "")
ANTH_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

results = {}
errors = {}


def run_gemini(name, out_file):
    if not GEMINI_KEY:
        errors[name] = "GEMINI_API_KEY not set"
        return
    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_KEY}"
        payload = {
            "contents": [{"parts": [{"text": PROMPT}]}],
            "tools": [{"google_search": {}}],
            "generationConfig": {"temperature": 0.3, "maxOutputTokens": 65536},
        }
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
        print(f"[{name}] Starting...")
        start = time.time()
        with urllib.request.urlopen(req, timeout=900) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        elapsed = time.time() - start
        text_parts = []
        for c in body.get("candidates", []):
            for p in c.get("content", {}).get("parts", []):
                if "text" in p:
                    text_parts.append(p["text"])
        result_text = "\n".join(text_parts)
        usage = body.get("usageMetadata", {})
        out_path = OUTPUT_DIR / out_file
        out_path.write_text(
            f"# Research R2: {name}\n\n"
            f"**Time**: {elapsed:.1f}s\n"
            f"**Tokens**: in={usage.get('promptTokenCount', '?')}, out={usage.get('candidatesTokenCount', '?')}\n\n"
            f"---\n\n{result_text}\n",
            encoding="utf-8",
        )
        results[name] = f"OK ({elapsed:.0f}s, {len(result_text)} chars)"
        print(f"[{name}] Done in {elapsed:.0f}s, {len(result_text)} chars")
    except Exception as e:
        errors[name] = str(e)
        print(f"[{name}] ERROR: {e}")


def run_openai():
    if not OPENAI_KEY:
        errors["openai"] = "OPENAI_API_KEY not set"
        return
    try:
        url = "https://api.openai.com/v1/responses"
        payload = {
            "model": "gpt-4.1-mini",
            "input": PROMPT,
            "tools": [{"type": "web_search_preview"}],
            "temperature": 0.3,
        }
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url, data=data, headers={"Content-Type": "application/json", "Authorization": f"Bearer {OPENAI_KEY}"}
        )
        print("[openai] Starting...")
        start = time.time()
        with urllib.request.urlopen(req, timeout=900) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        elapsed = time.time() - start
        result_text = ""
        for item in body.get("output", []):
            if item.get("type") == "message":
                for content in item.get("content", []):
                    if content.get("type") == "output_text":
                        result_text += content.get("text", "")
        usage = body.get("usage", {})
        (OUTPUT_DIR / "03-openai.md").write_text(
            f"# Research R2: OpenAI gpt-4.1-mini\n\n"
            f"**Time**: {elapsed:.1f}s\n"
            f"**Tokens**: in={usage.get('input_tokens', '?')}, out={usage.get('output_tokens', '?')}\n\n"
            f"---\n\n{result_text}\n",
            encoding="utf-8",
        )
        results["openai"] = f"OK ({elapsed:.0f}s, {len(result_text)} chars)"
        print(f"[openai] Done in {elapsed:.0f}s, {len(result_text)} chars")
    except Exception as e:
        errors["openai"] = str(e)
        print(f"[openai] ERROR: {e}")


def run_perplexity():
    if not PPLX_KEY:
        errors["perplexity"] = "PERPLEXITY_API_KEY not set"
        return
    try:
        url = "https://api.perplexity.ai/chat/completions"
        payload = {
            "model": "sonar-deep-research",
            "messages": [{"role": "user", "content": PROMPT}],
            "temperature": 0.3,
        }
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url, data=data, headers={"Content-Type": "application/json", "Authorization": f"Bearer {PPLX_KEY}"}
        )
        print("[perplexity] Starting...")
        start = time.time()
        with urllib.request.urlopen(req, timeout=900) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        elapsed = time.time() - start
        result_text = ""
        for choice in body.get("choices", []):
            result_text += choice.get("message", {}).get("content", "")
        citations = body.get("citations", [])
        usage = body.get("usage", {})
        cit_text = "\n\n## Sources\n" + "\n".join(f"- {c}" for c in citations) if citations else ""
        (OUTPUT_DIR / "04-perplexity.md").write_text(
            f"# Research R2: Perplexity Deep\n\n"
            f"**Time**: {elapsed:.1f}s\n"
            f"**Tokens**: in={usage.get('prompt_tokens', '?')}, out={usage.get('completion_tokens', '?')}\n"
            f"**Citations**: {len(citations)}\n\n"
            f"---\n\n{result_text}{cit_text}\n",
            encoding="utf-8",
        )
        results["perplexity"] = f"OK ({elapsed:.0f}s, {len(result_text)} chars, {len(citations)} cit)"
        print(f"[perplexity] Done in {elapsed:.0f}s, {len(result_text)} chars")
    except Exception as e:
        errors["perplexity"] = str(e)
        print(f"[perplexity] ERROR: {e}")


def run_claude():
    if not ANTH_KEY:
        errors["claude"] = "ANTHROPIC_API_KEY not set"
        return
    try:
        url = "https://api.anthropic.com/v1/messages"
        payload = {
            "model": "claude-opus-4-20250514",
            "max_tokens": 16384,
            "temperature": 0.3,
            "messages": [{"role": "user", "content": PROMPT}],
        }
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={
                "Content-Type": "application/json",
                "x-api-key": ANTH_KEY,
                "anthropic-version": "2023-06-01",
            },
        )
        print("[claude] Starting...")
        start = time.time()
        with urllib.request.urlopen(req, timeout=900) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        elapsed = time.time() - start
        result_text = ""
        for block in body.get("content", []):
            if block.get("type") == "text":
                result_text += block.get("text", "")
        usage = body.get("usage", {})
        (OUTPUT_DIR / "05-claude-opus.md").write_text(
            f"# Research R2: Claude Opus 4\n\n"
            f"**Time**: {elapsed:.1f}s\n"
            f"**Tokens**: in={usage.get('input_tokens', '?')}, out={usage.get('output_tokens', '?')}\n\n"
            f"---\n\n{result_text}\n",
            encoding="utf-8",
        )
        results["claude"] = f"OK ({elapsed:.0f}s, {len(result_text)} chars)"
        print(f"[claude] Done in {elapsed:.0f}s, {len(result_text)} chars")
    except Exception as e:
        errors["claude"] = str(e)
        print(f"[claude] ERROR: {e}")


if __name__ == "__main__":
    print("=" * 60)
    print("RESEARCH 2: 5 AI providers in parallel")
    print("=" * 60)
    print(f"Output: {OUTPUT_DIR}/")
    print()

    threads = [
        threading.Thread(target=run_gemini, args=("gemini-1", "01-gemini-1.md")),
        threading.Thread(target=run_gemini, args=("gemini-2", "02-gemini-2.md")),
        threading.Thread(target=run_openai),
        threading.Thread(target=run_perplexity),
        threading.Thread(target=run_claude),
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=960)

    print()
    print("=" * 60)
    print("ALL DONE")
    print("=" * 60)
    print("\nResults:")
    for n, s in results.items():
        print(f"  {n}: {s}")
    if errors:
        print("\nErrors:")
        for n, e in errors.items():
            print(f"  {n}: {e}")
    print(f"\nFiles in {OUTPUT_DIR}/:")
    for f in sorted(OUTPUT_DIR.glob("*.md")):
        print(f"  {f.name} ({f.stat().st_size:,} bytes)")
