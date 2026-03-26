"""
Domain availability checker for brand names.
Uses WHOIS lookup to check .com and .ai domains.
"""

import subprocess
import socket
import time
import json
from datetime import datetime

BRANDS = [
    # Round 4: parole vere corte, suonano come tool/prodotti tech
    "clawry",
    "skillix",
    "agntly",
    "clawly",
    "skillry",
    "clawio",
    "skiply",
    "agntio",
    "clawra",
    "skillra",
    # Parole inventate 2 sillabe
    "zenclaw",
    "clawtap",
    "tapskill",
    "skillap",
    "clawrun",
    "runagent",
    "shipagent",
    "agentship",
    # Combo uniche
    "noclaw",
    "superclaw",
    "rawskill",
    "rawclaw",
    "hotskill",
    "coldskill",
    "deepclaw",
    "fastclaw",
    "megaclaw",
    "neoclaw",
    "hypeclaw",
    "maxskill",
]

TLDS = [".com", ".ai"]


def check_dns(domain: str) -> bool:
    """Check if domain resolves via DNS. No resolution = likely available."""
    try:
        socket.setdefaulttimeout(3)
        socket.getaddrinfo(domain, 80)
        return True  # resolves = taken
    except socket.gaierror:
        return False  # no resolution = possibly available
    except Exception:
        return False


def check_whois(domain: str) -> dict:
    """Run whois command and parse result."""
    try:
        result = subprocess.run(
            ["whois", domain],
            capture_output=True,
            text=True,
            timeout=10,
        )
        output = result.stdout.lower()

        # Indicators that domain is available
        free_indicators = [
            "no match for",
            "not found",
            "no entries found",
            "no data found",
            "domain not found",
            "status: free",
            "status: available",
            "no object found",
            "nothing found",
            "is available",
        ]

        # Indicators that domain is taken
        taken_indicators = [
            "creation date",
            "created on",
            "registered on",
            "registrant",
            "name server",
            "nserver",
            "status: active",
            "domain name:",
        ]

        is_free = any(indicator in output for indicator in free_indicators)
        is_taken = any(indicator in output for indicator in taken_indicators)

        if is_free and not is_taken:
            return {"status": "AVAILABLE", "raw": output[:200]}
        elif is_taken:
            return {"status": "TAKEN", "raw": output[:200]}
        else:
            return {"status": "UNKNOWN", "raw": output[:200]}

    except subprocess.TimeoutExpired:
        return {"status": "TIMEOUT", "raw": ""}
    except FileNotFoundError:
        return {"status": "NO_WHOIS", "raw": "whois command not found"}
    except Exception as e:
        return {"status": "ERROR", "raw": str(e)}


def check_domain(domain: str) -> dict:
    """Check domain availability using DNS + WHOIS."""
    dns_resolves = check_dns(domain)

    if dns_resolves:
        return {"domain": domain, "status": "TAKEN", "method": "DNS"}

    # DNS doesn't resolve — check WHOIS for confirmation
    whois_result = check_whois(domain)

    if whois_result["status"] == "AVAILABLE":
        return {"domain": domain, "status": "🟢 AVAILABLE", "method": "WHOIS"}
    elif whois_result["status"] == "TAKEN":
        return {"domain": domain, "status": "TAKEN (parked/no DNS)", "method": "WHOIS"}
    elif whois_result["status"] == "NO_WHOIS":
        # No whois command — use DNS-only result
        return {"domain": domain, "status": "🟡 POSSIBLY AVAILABLE (no DNS)", "method": "DNS-only"}
    else:
        return {"domain": domain, "status": f"🟡 UNKNOWN ({whois_result['status']})", "method": "WHOIS"}


def main():
    print("=" * 65)
    print(f"  DOMAIN AVAILABILITY CHECK — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 65)

    import sys
    sys.stdout.reconfigure(encoding='utf-8')

    results = {"available": [], "possibly_available": [], "taken": []}

    total = len(BRANDS) * len(TLDS)
    checked = 0

    for brand in BRANDS:
        print(f"\n{'─' * 50}")
        print(f"  {brand.upper()}")
        print(f"{'─' * 50}")

        for tld in TLDS:
            domain = f"{brand}{tld}"
            checked += 1
            print(f"  [{checked}/{total}] {domain:<30}", end="", flush=True)

            result = check_domain(domain)
            print(f" {result['status']}")

            if "AVAILABLE" in result["status"] and "POSSIBLY" not in result["status"]:
                results["available"].append(domain)
            elif "POSSIBLY" in result["status"] or "UNKNOWN" in result["status"]:
                results["possibly_available"].append(domain)
            else:
                results["taken"].append(domain)

            time.sleep(1)  # Rate limit between checks

    # Summary
    print("\n" + "=" * 65)
    print("  SUMMARY")
    print("=" * 65)

    if results["available"]:
        print(f"\n  🟢 AVAILABLE ({len(results['available'])}):")
        for d in results["available"]:
            print(f"     ✅ {d}")

    if results["possibly_available"]:
        print(f"\n  🟡 POSSIBLY AVAILABLE ({len(results['possibly_available'])}):")
        for d in results["possibly_available"]:
            print(f"     ❓ {d}")

    if results["taken"]:
        print(f"\n  🔴 TAKEN ({len(results['taken'])}):")
        for d in results["taken"]:
            print(f"     ❌ {d}")

    # Save results
    output_path = "ryan_cole/domain_results.json"
    with open(output_path, "w") as f:
        json.dump(
            {
                "checked_at": datetime.now().isoformat(),
                "results": results,
                "all_checks": [
                    {"domain": f"{b}{t}", "brand": b, "tld": t}
                    for b in BRANDS
                    for t in TLDS
                ],
            },
            f,
            indent=2,
        )
    print(f"\n  Results saved to {output_path}")


if __name__ == "__main__":
    main()
