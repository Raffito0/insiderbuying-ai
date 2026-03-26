"""Check .com domain availability via Verisign RDAP (most reliable method)."""
import json
import urllib.request
import urllib.error
import time
import sys

DOMAINS = [
    # AI + Finance blend
    "alpharesearch.com",
    "alphaintel.com",
    "alphaedgeai.com",
    "alphamindai.com",
    "alphapulse.com",
    "alphascope.com",
    "alphadesk.com",
    "alphalens.com",

    # Stock/Market + AI
    "stockpulseai.com",
    "stockmindai.com",
    "stockscopeai.com",
    "stocklensai.com",
    "stocknerdai.com",
    "stockradarai.com",
    "stockvaultai.com",
    "marketpulseai.com",
    "marketmindai.com",
    "marketlensai.com",

    # Dexter brand
    "dexterfinance.com",
    "dexterstocks.com",
    "dextermarket.com",
    "dexteralpha.com",
    "dexterresearch.com",

    # Research/Analysis brand
    "tickerlab.com",
    "tickerlabs.com",
    "tickerpulse.com",
    "tickerscope.com",
    "tickernerd.com",
    "tickerintel.com",

    # Data-driven brand
    "deepstockdata.com",
    "deepmarketdata.com",
    "deeptickerdata.com",
    "stockdatalab.com",
    "datadrivenalpha.com",

    # Catchy/Brandable
    "bullcaseai.com",
    "bearcaseai.com",
    "bullorbear.ai",
    "stockverdicts.com",
    "stockverdictai.com",
    "thestocknerds.com",
    "thestockmind.com",
    "wallstreetnerd.com",
    "wallstreetnerds.com",
    "insideredgeai.com",
    "insiderpulse.com",
    "insiderpulseai.com",
    "insideralertai.com",

    # Short/Punchy
    "finpulse.com",
    "finlens.com",
    "finscope.com",
    "finintel.com",
    "finvault.com",
    "finradar.com",
    "finnerds.com",
    "findive.com",
    "finedgeai.com",

    # Newsletter-style
    "morningalpha.com",
    "dailyalpha.com",
    "weeklyalpha.com",
    "alphamorning.com",
    "alphadaily.com",
    "alphaweekly.com",
    "thealphabrief.com",
    "thealphaedge.com",
    "alphadigest.com",

    # Premium/Trust
    "vaultresearch.com",
    "vaultstocks.com",
    "vaultfinance.com",
    "sentinelstocks.com",
    "sentinelmarket.com",
    "signalvault.com",
    "signalalpha.com",

    # Unique/Invented
    "stockwise.ai",
    "finbrain.com",
    "finbrainai.com",
    "stockbrain.com",
    "stockbrainai.com",
    "marketbrain.com",
    "marketbrainai.com",
    "neuralstocks.com",
    "neuralmarket.com",
    "quantnerd.com",
    "quantnerds.com",
    "quantpulse.com",
]

def check_rdap(domain):
    """Check via Verisign RDAP — the authoritative .com registry."""
    url = f"https://rdap.verisign.com/com/v1/domain/{domain}"
    req = urllib.request.Request(url, headers={"User-Agent": "DomainChecker/1.0"})
    try:
        resp = urllib.request.urlopen(req, timeout=10)
        data = json.loads(resp.read().decode())
        # If we get a response, domain is TAKEN
        registrar = "unknown"
        for e in data.get("entities", []):
            name = e.get("vcardArray", [None, []])[1]
            for field in (name or []):
                if field[0] == "fn":
                    registrar = field[3]
                    break
        return {"available": False, "registrar": registrar}
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {"available": True}
        return {"error": f"HTTP {e.code}"}
    except Exception as e:
        return {"error": str(e)}

available = []
taken = []
errors = []

print(f"Checking {len(DOMAINS)} domains via Verisign RDAP...\n")

for i, domain in enumerate(DOMAINS):
    result = check_rdap(domain)

    if result.get("available"):
        available.append(domain)
        print(f"  [{i+1}/{len(DOMAINS)}] AVAILABLE  {domain}")
    elif result.get("error"):
        errors.append((domain, result["error"]))
        print(f"  [{i+1}/{len(DOMAINS)}] ERROR      {domain} ({result['error']})")
    else:
        taken.append(domain)
        print(f"  [{i+1}/{len(DOMAINS)}] taken      {domain}")

    time.sleep(0.3)  # rate limit

print(f"\n{'='*60}")
print(f"RESULTS: {len(available)} available / {len(taken)} taken / {len(errors)} errors")
print(f"{'='*60}")

if available:
    print(f"\nAVAILABLE DOMAINS ({len(available)}):")
    for d in available:
        print(f"  -> {d}")

# Save results
results = {
    "available": available,
    "taken": taken,
    "errors": [(d, e) for d, e in errors],
    "total_checked": len(DOMAINS)
}
with open("ryan_cole/finance_domain_results.json", "w") as f:
    json.dump(results, f, indent=2)

print(f"\nResults saved to ryan_cole/finance_domain_results.json")
