"""Round 2: more creative/brandable names."""
import json, urllib.request, urllib.error, time

DOMAINS = [
    # Short punchy invented
    "stockora.com",
    "finora.com",
    "alphaora.com",
    "tickora.com",
    "markora.com",
    "stonkly.com",
    "stonklab.com",
    "finlytics.com",
    "stocklytics.com",

    # Clever wordplay
    "thebullcase.com",
    "thebearcase.com",
    "bullcasereport.com",
    "insideredge.ai",
    "insidersignal.com",
    "insidersignals.com",
    "insidertracker.ai",
    "smartalpha.com",
    "smartalphaai.com",

    # Trust/Authority
    "theanalystdesk.com",
    "analystdesk.com",
    "analystpulse.com",
    "theresearchdesk.com",
    "researchpulseai.com",
    "proanalyst.com",
    "proanalystai.com",

    # Newsletter style
    "thealphareport.com",
    "thealphafile.com",
    "alphafiledaily.com",
    "thestockfile.com",
    "thetickertape.com",
    "tickertapeai.com",
    "stockfiledaily.com",

    # Clean AI brand
    "aistockreport.com",
    "aistockresearch.com",
    "aistockanalysis.com",
    "aimarketresearch.com",
    "aistockalert.com",
    "aifinreport.com",
    "aifinresearch.com",

    # Edge/Signal
    "edgealpha.com",
    "alphasignalai.com",
    "signalstockai.com",
    "edgestockai.com",
    "clearalphaai.com",
    "truesignalai.com",
    "rawalphaai.com",

    # Data nerd
    "nerdstreet.com",
    "stocknerdclub.com",
    "datanerdstocks.com",
    "thenerdstreet.com",

    # Premium short
    "deepalpha.ai",
    "deepalpha.com",
    "rawdata.ai",
    "rawalpha.com",
    "rawalpha.ai",
    "puredata.ai",
    "purealpha.com",
    "purealpha.ai",

    # Unique combos
    "stockpilotai.com",
    "marketpilotai.com",
    "autopilotalpha.com",
    "alphaautomate.com",
    "autoalpha.com",
    "autoalphaai.com",
    "alphaengine.com",
    "alphaengineai.com",

    # Verdict/Judge style (fits the brand)
    "thestockjudge.com",
    "stockjudge.com",
    "marketjudge.com",
    "tickerjudge.com",
    "thefinalverdict.com",
    "stockruling.com",
    "marketverdict.com",
    "marketverdictai.com",
]

available = []
taken = []

print(f"Round 2: Checking {len(DOMAINS)} domains...\n")

for i, domain in enumerate(DOMAINS):
    # Handle .ai domains differently (RDAP only works for .com)
    if domain.endswith(".ai"):
        # For .ai we can only do DNS check (less reliable but ok for filtering)
        import socket
        try:
            socket.getaddrinfo(domain, None)
            taken.append(domain)
            print(f"  [{i+1}/{len(DOMAINS)}] likely taken {domain}")
        except socket.gaierror:
            available.append(domain)
            print(f"  [{i+1}/{len(DOMAINS)}] MAYBE FREE  {domain} (needs manual verify)")
        time.sleep(0.2)
        continue

    url = f"https://rdap.verisign.com/com/v1/domain/{domain}"
    req = urllib.request.Request(url, headers={"User-Agent": "DomainChecker/1.0"})
    try:
        urllib.request.urlopen(req, timeout=10)
        taken.append(domain)
        print(f"  [{i+1}/{len(DOMAINS)}] taken      {domain}")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            available.append(domain)
            print(f"  [{i+1}/{len(DOMAINS)}] AVAILABLE  {domain}")
        else:
            print(f"  [{i+1}/{len(DOMAINS)}] error      {domain} (HTTP {e.code})")
    except Exception as e:
        print(f"  [{i+1}/{len(DOMAINS)}] error      {domain} ({e})")
    time.sleep(0.3)

print(f"\n{'='*60}")
print(f"RESULTS: {len(available)} available / {len(taken)} taken")
print(f"{'='*60}")

if available:
    print(f"\nAVAILABLE DOMAINS ({len(available)}):")
    for d in available:
        print(f"  -> {d}")

# Merge with round 1
try:
    with open("ryan_cole/finance_domain_results.json") as f:
        r1 = json.load(f)
    all_available = r1["available"] + available
except:
    all_available = available

results = {"available_round2": available, "all_available": all_available}
with open("ryan_cole/finance_domain_results2.json", "w") as f:
    json.dump(results, f, indent=2)

print(f"\nALL AVAILABLE (round 1 + 2): {len(all_available)}")
for d in all_available:
    print(f"  -> {d}")
