"""
Check invented/nonsense brand names via Verisign RDAP.
"""

import urllib.request
import json
import time
import sys


DOMAINS = [
    # 5 lettere - suonano tech
    "clvra.com", "sklra.com", "agnti.com", "clwra.com",
    "brskl.com", "frskl.com", "zyphr.com", "vyskl.com",
    "nexkl.com", "prskl.com", "klynt.com", "sklyp.com",
    "flynx.com", "gryvn.com", "prynx.com", "trynx.com",
    "blynk.com", "krynx.com", "spynx.com", "drynx.com",

    # 6 lettere - pronunciabili
    "skilra.com", "clawra.com", "agentz.com", "clawnr.com",
    "vrskil.com", "zephkl.com", "klawdr.com", "prymsk.com",
    "synthr.com", "plexkl.com", "vyndra.com", "kelvra.com",
    "zolthr.com", "qynthr.com", "bolthr.com", "dravyn.com",
    "trovex.com", "brevox.com", "clavex.com", "skivex.com",
    "drivex.com", "provex.com", "clovex.com", "trivox.com",

    # Parole inventate pronunciabili tipo Vercel/Stripe
    "clvnt.com", "sklnt.com", "plvnt.com",
    "torqai.com", "vektai.com", "pulsai.com",
    "zentik.com", "mantik.com", "deftik.com",
    "kresko.com", "bresko.com", "flesko.com",
    "vontra.com", "kontra.com", "sentra.com",
    "pyxlr.com", "byxlr.com", "nyxlr.com",
    "revkl.com", "devkl.com", "levkl.com",

    # Suoni forti, memorabili, 4-6 lettere
    "vrakt.com", "krakt.com", "trakt.com",
    "spekt.com", "brekt.com", "frekt.com",
    "klynr.com", "blynr.com", "glynr.com",
    "dryft.com", "kryft.com", "bryft.com",
    "swyft.com", "twyft.com", "flyft.com",

    # Combo consonante+vocale fluide
    "vorkai.com", "zarkai.com", "nerkai.com",
    "tekvor.com", "bekvor.com", "rekvor.com",
    "sylkra.com", "volkra.com", "zerkra.com",
    "nixkra.com", "dexkra.com", "rexkra.com",

    # Ultra-short 4 lettere
    "klaw.com", "skyl.com", "vrsk.com",
    "zklr.com", "bkyl.com", "fkyl.com",
    "nkyl.com", "tklr.com", "dklr.com",

    # Stile "app name" moderno
    "shipd.com", "stackd.com", "craftd.com",
    "forged.com", "minted.com", "vaulted.com",
    "bolted.com", "wired.com", "geared.com",
    "pulsed.com", "sparked.com", "brewed.com",

    # Nomi completamente inventati facili da dire
    "zurvex.com", "korvex.com", "norvex.com",
    "brivex.com", "drovex.com", "stivex.com",
    "klivex.com", "grivex.com", "frivex.com",
    "pluvex.com", "truvex.com", "bruvex.com",
    "clivra.com", "blivra.com", "glivra.com",
    "spivra.com", "trivra.com", "drivra.com",
    "kluvex.com", "skuvex.com", "pruvex.com",
    "zarvex.com", "tarvex.com", "marvex.com",
]


def check_rdap(domain):
    url = f"https://rdap.verisign.com/com/v1/domain/{domain}"
    req = urllib.request.Request(url, headers={"Accept": "application/rdap+json"})
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            return "TAKEN"
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return "AVAILABLE"
        return f"ERROR-{e.code}"
    except Exception as e:
        return f"ERROR"


def main():
    sys.stdout.reconfigure(encoding='utf-8')

    print("=" * 60)
    print("  INVENTED NAMES — RDAP CHECK (.com)")
    print("=" * 60)

    available = []

    for i, domain in enumerate(DOMAINS, 1):
        print(f"  [{i}/{len(DOMAINS)}] {domain:<22}", end="", flush=True)

        status = check_rdap(domain)

        if status == "AVAILABLE":
            print(f" >>> AVAILABLE <<<")
            available.append(domain)
        else:
            print(f" {status.lower()}")

        time.sleep(0.4)

    print("\n" + "=" * 60)
    if available:
        print(f"\n  AVAILABLE .com DOMAINS ({len(available)}):\n")
        for d in available:
            print(f"     >>> {d} <<<")
    else:
        print("\n  Nothing available.")

    with open("ryan_cole/invented_results.json", "w") as f:
        json.dump({"available": available, "total_checked": len(DOMAINS)}, f, indent=2)

    print(f"\n  Checked {len(DOMAINS)} domains. Saved to ryan_cole/invented_results.json")


if __name__ == "__main__":
    main()
