"""Check all domains from Gemini's list via Verisign RDAP."""
import json, urllib.request, urllib.error, time

DOMAINS = [
    # Category 1: The "Insider" Authority
    "insiderbuyingalerts.com",
    "insidertradealerts.com",
    "liveinsiderbuying.com",
    "proinsideralerts.com",
    "insiderbuysignal.com",
    "theinsidertracker.com",
    "insidersecalerts.com",
    "insiderflows.com",
    "insidertradebot.com",
    "expertinsideralerts.com",

    # Category 2: Smart Money & Whale
    "smartmoneyalerts.com",
    "whalebuyalerts.com",
    "followthewhales.com",
    "smartmoneysignals.com",
    "whaleinsider.com",
    "thewhalefilings.com",
    "smartinsiderbuying.com",
    "whalewatchalerts.com",
    "puresmartmoney.com",
    "whaleactivity.com",

    # Category 3: Institutional & Copy
    "copytheinsiders.com",
    "institutionalflows.com",
    "theinsidercopy.com",
    "executivebuying.com",
    "directoralerts.com",
    "insideralphaalerts.com",
    "eliteinsidertrade.com",
    "alphainsiderbot.com",
    "institutionalinsiders.com",
    "executivetradeflow.com",

    # Category 4: SEC Filings & Real-Time
    "secfilingsalert.com",
    "realtimesec.com",
    "filingstracker.com",
    "livesecalerts.com",
    "secinsidertrading.com",
    "instantinsider.com",
    "secwhalealerts.com",
    "filingsscanner.com",
    "thesecmonitor.com",
    "secbuyingsignal.com",

    # Category 5: Short & Modern
    "insiderpulse.com",
    "tradewhale.com",
    "signalinsider.com",
    "buyinsider.com",
    "insidervault.com",
    "theinsideredge.com",
    "pureinsiders.com",
    "alertinsider.com",
    "insiderbrief.com",
    "gainsinsider.com",
]

available = []
taken = []

print(f"Gemini domains: checking {len(DOMAINS)} via Verisign RDAP...\n")

for i, domain in enumerate(DOMAINS):
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
print(f"RESULTS: {len(available)} AVAILABLE / {len(taken)} taken")
print(f"{'='*60}")

if available:
    print(f"\nAVAILABLE ({len(available)}):")
    for d in available:
        print(f"  -> {d}")

with open("ryan_cole/gemini_domain_results.json", "w") as f:
    json.dump({"available": available, "taken": taken, "total": len(DOMAINS)}, f, indent=2)
print(f"\nSaved to ryan_cole/gemini_domain_results.json")
