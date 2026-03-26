"""Exact-match domains that ARE the Google search keyword + sound like a brand."""
import json, urllib.request, urllib.error, time

# These are all real search keywords people type into Google
# Each one has search volume AND sounds brandable
DOMAINS = [
    # === HIGH VOLUME KEYWORDS (10k-100k searches/month) ===
    # "stock analysis" variations
    "stockanalysisai.com",
    "mystockanalysis.com",
    "smartstockanalysis.com",
    "prostockanalysis.com",
    "deepstockanalysis.com",
    "livestockanalysis.com",
    "stockanalysispro.com",
    "stockanalysislab.com",
    "stockanalysishub.com",
    "stockanalysisdaily.com",

    # "stock research" variations
    "aistockresearch.com",
    "smartstockresearch.com",
    "prostockresearch.com",
    "deepstockresearch.com",
    "stockresearchai.com",
    "stockresearchlab.com",
    "stockresearchhub.com",
    "freestockresearch.com",

    # "stock screener" variations
    "aistockscreener.com",
    "smartstockscreener.com",
    "prostockscreener.com",
    "stockscreenerai.com",
    "freestockscreener.com",

    # "stock forecast" / "stock prediction"
    "stockforecastai.com",
    "aistockforecast.com",
    "stockpredictionai.com",
    "aistockprediction.com",
    "smartstockforecast.com",

    # === MEDIUM VOLUME (1k-10k searches/month) ===
    # "earnings analysis"
    "earningsanalysis.com",
    "earningsanalysisai.com",
    "earningsreportai.com",
    "earningsforecast.com",
    "earningsforecastai.com",
    "myearningsanalysis.com",

    # "stock deep dive"
    "stockdeepdive.com",
    "stockdeepdives.com",
    "deepdivestocks.com",
    "thedeepdive.com",
    "deepdiveanalysis.com",
    "deepdivefinance.com",
    "deepdivereport.com",

    # "insider trading" / "insider buying"
    "insidertradingai.com",
    "insiderbuyingalert.com",
    "insiderbuyingalerts.com",
    "insidertradingalert.com",
    "insidertradingalerts.com",
    "insiderbuyingtracker.com",
    "trackinsiderbuying.com",
    "insiderbuyingreport.com",

    # "stock valuation"
    "stockvaluationai.com",
    "aistockvaluation.com",
    "smartstockvaluation.com",
    "stockvaluationpro.com",
    "stockvaluationtool.com",

    # "stock comparison" / "stock vs stock"
    "stockcompareai.com",
    "comparestocksai.com",
    "stockvsstock.com",
    "stockcomparison.com",
    "stockcomparisonai.com",

    # "best stocks to buy"
    "beststockstobuy.ai",
    "beststockstoday.com",
    "topstockstoday.com",
    "topstockpicks.com",
    "topstockpicksai.com",

    # "dividend stocks"
    "dividendstocksai.com",
    "smartdividends.com",
    "dividendanalysis.com",
    "dividendanalysisai.com",
    "dividendscreener.com",
    "dividendscreenerai.com",

    # "stock report"
    "dailystockreport.com",
    "weeklystockreport.com",
    "aistockreportai.com",
    "thestockreport.com",
    "smartstockreport.com",

    # === BRANDABLE + KEYWORD COMBOS ===
    # Suonano bene come brand E sono keyword
    "stockinsightai.com",
    "stockinsightspro.com",
    "marketinsightai.com",
    "stockwatchai.com",
    "stockwatchpro.com",
    "marketwatchai.com",  # careful - MarketWatch is a brand
    "alphainsight.com",
    "alphainsightai.com",
    "alphainsights.com",

    # "stock picker"
    "aistockpicker.com",
    "smartstockpicker.com",
    "stockpickerai.com",
    "thestockpicker.com",

    # Premium newsletter-style keyword domains
    "dailystockpicks.com",
    "weeklystockpicks.com",
    "stockpickstoday.com",
    "stockpicksweekly.com",
    "alphastockpicks.com",
]

available = []
taken = []

print(f"EMD Check: {len(DOMAINS)} keyword-domains...\n")

for i, domain in enumerate(DOMAINS):
    if domain.endswith(".ai"):
        import socket
        try:
            socket.getaddrinfo(domain, None)
            taken.append(domain)
            print(f"  [{i+1}/{len(DOMAINS)}] likely taken {domain}")
        except socket.gaierror:
            available.append(domain)
            print(f"  [{i+1}/{len(DOMAINS)}] MAYBE FREE  {domain}")
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
            print(f"  [{i+1}/{len(DOMAINS)}] error      {domain}")
    except Exception:
        print(f"  [{i+1}/{len(DOMAINS)}] error      {domain}")
    time.sleep(0.3)

print(f"\n{'='*60}")
print(f"RESULTS: {len(available)} available / {len(taken)} taken")
print(f"{'='*60}")

if available:
    print(f"\nAVAILABLE EMD DOMAINS ({len(available)}):")
    for d in available:
        print(f"  -> {d}")

with open("ryan_cole/finance_emd_results.json", "w") as f:
    json.dump({"available": available, "taken": taken}, f, indent=2)
