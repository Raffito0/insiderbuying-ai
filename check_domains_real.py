"""
Domain availability checker using RDAP (official registrar database).
Only checks .com domains via Verisign RDAP — the ONLY reliable free method.
"""

import urllib.request
import json
import time
import sys

DOMAINS = [
    # Top picks from all rounds
    "agntio.com", "clawtap.com", "skillcore.com", "clawyard.com",
    "shipagent.com", "skiply.com", "agentdeck.com", "dropclaude.com",
    "agentpills.com",
    # Round 1
    "skillforge.com", "agentdrop.com", "clawkit.com", "shipskills.com",
    "skillvault.com",
    # New creative names - inventate
    "clawbox.com", "skillbox.com", "agentbox.com",
    "clawly.com", "skillit.com", "agntly.com",
    "clawup.com", "skillup.com",
    "clawden.com", "skillden.com",
    "clawbit.com", "skillbit.com",
    "clawgo.com", "skillgo.com",
    "clawnet.com", "skillnet.com",
    # Parole inventate stile Vercel
    "clawnova.com", "skillnova.com",
    "clawzen.com", "skillzen.com",
    "clawhive.com", "skillhive.com",
    "clawpod.com", "skillpod.com",
    "clawmesh.com", "skillmesh.com",
    "clawnode.com", "skillnode.com",
    "clawstack.com", "skillstack.com",
    "clawlab.com", "skilllab.com",
    "clawify.com", "skillify.com",
    # Ultra short / inventate
    "skvault.com", "sklrm.com",
    "agntx.com", "clawx.com", "sklx.com",
    "getclaw.com", "useclaw.com",
    "getskill.com", "useskill.com",
    # Nuovi concept
    "clawstore.com", "skillstore.com",
    "clawmarket.com", "skillmarket.com",
    "clawbay.com", "skillbay.com",
    "clawshop.com", "skillshop.com",
    # Prefix play
    "preclaw.com", "preskill.com",
    "myclaw.com", "myskill.com",
    "theclaw.com", "theskill.com",
    "oneclaw.com", "oneskill.com",
]


def check_rdap(domain: str) -> dict:
    """Check .com domain via Verisign RDAP (authoritative source)."""
    url = f"https://rdap.verisign.com/com/v1/domain/{domain}"
    req = urllib.request.Request(url, headers={"Accept": "application/rdap+json"})

    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read())
            registrar = "unknown"
            created = "unknown"
            for entity in data.get("entities", []):
                if "registrar" in entity.get("roles", []):
                    vcard = entity.get("vcardArray", [None, []])[1]
                    for item in vcard:
                        if item[0] == "fn":
                            registrar = item[3]
            for event in data.get("events", []):
                if event.get("eventAction") == "registration":
                    created = event.get("eventDate", "unknown")[:10]
            return {"status": "TAKEN", "registrar": registrar, "created": created}
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {"status": "AVAILABLE", "registrar": None, "created": None}
        return {"status": f"ERROR ({e.code})", "registrar": None, "created": None}
    except Exception as e:
        return {"status": f"ERROR ({e})", "registrar": None, "created": None}


def main():
    sys.stdout.reconfigure(encoding='utf-8')

    print("=" * 70)
    print("  RDAP DOMAIN CHECK (Verisign authoritative .com registry)")
    print("=" * 70)

    available = []
    taken = []
    errors = []

    for i, domain in enumerate(DOMAINS, 1):
        print(f"  [{i}/{len(DOMAINS)}] {domain:<25}", end="", flush=True)

        result = check_rdap(domain)

        if result["status"] == "AVAILABLE":
            print(f" >>> AVAILABLE <<<")
            available.append(domain)
        elif result["status"] == "TAKEN":
            print(f" taken ({result['registrar']}, {result['created']})")
            taken.append(domain)
        else:
            print(f" {result['status']}")
            errors.append(domain)

        time.sleep(0.5)

    print("\n" + "=" * 70)
    print("  RESULTS")
    print("=" * 70)

    if available:
        print(f"\n  AVAILABLE ({len(available)}):")
        for d in available:
            print(f"     >>> {d} <<<")
    else:
        print("\n  No .com domains available from this list.")

    print(f"\n  TAKEN: {len(taken)}")
    if errors:
        print(f"  ERRORS: {len(errors)} — {errors}")

    # Save
    with open("ryan_cole/domain_results_real.json", "w") as f:
        json.dump({"available": available, "taken": taken, "errors": errors}, f, indent=2)

    print(f"\n  Saved to ryan_cole/domain_results_real.json")


if __name__ == "__main__":
    main()
