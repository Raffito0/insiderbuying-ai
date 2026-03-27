#!/bin/bash
# NocoDB Table Setup Script for EarlyInsider (Dexter Content Engine)
# Run after NocoDB is up: bash setup-tables.sh <NOCODB_URL> <API_TOKEN>
#
# Creates 4 core tables for the content engine:
#   - Keywords (W1 keyword selection)
#   - Articles (W2 article generation)
#   - Financial_Cache (Dexter data cache)
#   - Published_Images (W12 image assets)
#
# Usage:
#   1. Start NocoDB: docker-compose up -d
#   2. Open NocoDB UI, create API token in Settings > API Tokens
#   3. Run: bash setup-tables.sh http://localhost:8080 xc-abc123...

NOCODB_URL="${1:-http://localhost:8080}"
API_TOKEN="${2}"

if [ -z "$API_TOKEN" ]; then
  echo "Usage: bash setup-tables.sh <NOCODB_URL> <API_TOKEN>"
  echo "Example: bash setup-tables.sh http://localhost:8080 xc-abc123..."
  exit 1
fi

HEADER="xc-token: $API_TOKEN"

echo "=== EarlyInsider NocoDB Setup ==="
echo "URL: $NOCODB_URL"
echo ""

# --- Create base ---
echo "Creating base: EarlyInsider"
BASE_ID=$(curl -s -X POST "$NOCODB_URL/api/v2/meta/bases" \
  -H "$HEADER" \
  -H "Content-Type: application/json" \
  -d '{"title":"EarlyInsider"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))")

if [ -z "$BASE_ID" ]; then
  echo "ERROR: Failed to create base. Check URL and API token."
  exit 1
fi
echo "Base ID: $BASE_ID"
echo ""

create_table() {
  local title="$1"
  local columns="$2"

  echo "Creating table: $title"
  RESPONSE=$(curl -s -X POST "$NOCODB_URL/api/v2/meta/bases/$BASE_ID/tables" \
    -H "$HEADER" \
    -H "Content-Type: application/json" \
    -d "{\"title\":\"$title\",\"columns\":$columns}")

  TABLE_ID=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
  if [ -z "$TABLE_ID" ]; then
    echo "  ERROR: $(echo "$RESPONSE" | head -c 200)"
  else
    echo "  OK -> $TABLE_ID"
  fi
  echo "$TABLE_ID"
}

# --- Keywords Table (W1 output, W2 input) ---
KEYWORDS_ID=$(create_table "Keywords" '[
  {"title":"keyword","uidt":"SingleLineText"},
  {"title":"ticker","uidt":"SingleLineText"},
  {"title":"blog","uidt":"SingleSelect","dtxp":"insiderbuying,deepstockanalysis,dividenddeep"},
  {"title":"article_type","uidt":"SingleSelect","dtxp":"A,B,C,D"},
  {"title":"search_volume","uidt":"Number"},
  {"title":"difficulty","uidt":"Number"},
  {"title":"cpc","uidt":"Decimal"},
  {"title":"intent_multiplier","uidt":"Decimal"},
  {"title":"priority_score","uidt":"Decimal"},
  {"title":"secondary_keywords","uidt":"LongText"},
  {"title":"status","uidt":"SingleSelect","dtxp":"new,in_progress,used,skipped,invalid_ticker"},
  {"title":"updated_at","uidt":"DateTime"},
  {"title":"used_at","uidt":"DateTime"}
]')

# --- Articles Table (W2 output, site reads) ---
ARTICLES_ID=$(create_table "Articles" '[
  {"title":"slug","uidt":"SingleLineText"},
  {"title":"title","uidt":"SingleLineText"},
  {"title":"meta_description","uidt":"SingleLineText"},
  {"title":"body_html","uidt":"LongText"},
  {"title":"verdict_type","uidt":"SingleSelect","dtxp":"BUY,SELL,CAUTION,WAIT,NO_TRADE"},
  {"title":"verdict_text","uidt":"LongText"},
  {"title":"key_takeaways","uidt":"LongText"},
  {"title":"word_count","uidt":"Number"},
  {"title":"primary_keyword","uidt":"SingleLineText"},
  {"title":"secondary_keywords_used","uidt":"LongText"},
  {"title":"data_tables_count","uidt":"Number"},
  {"title":"filing_citations_count","uidt":"Number"},
  {"title":"confidence_notes","uidt":"LongText"},
  {"title":"ticker","uidt":"SingleLineText"},
  {"title":"sector","uidt":"SingleLineText"},
  {"title":"company_name","uidt":"SingleLineText"},
  {"title":"blog","uidt":"SingleSelect","dtxp":"insiderbuying,deepstockanalysis,dividenddeep"},
  {"title":"hero_image_url","uidt":"URL"},
  {"title":"og_image_url","uidt":"URL"},
  {"title":"author_name","uidt":"SingleLineText"},
  {"title":"status","uidt":"SingleSelect","dtxp":"enriching,published,draft,error"},
  {"title":"quality_gate_pass","uidt":"Checkbox"},
  {"title":"related_articles","uidt":"LongText"},
  {"title":"published_at","uidt":"DateTime"}
]')

# --- Financial_Cache Table (Dexter cache layer) ---
CACHE_ID=$(create_table "Financial_Cache" '[
  {"title":"ticker","uidt":"SingleLineText"},
  {"title":"data_type","uidt":"SingleSelect","dtxp":"income_stmt,balance_sheet,cash_flow,ratios,insider_trades,prices,competitors,transcripts,news"},
  {"title":"data_json","uidt":"LongText"},
  {"title":"fetched_at","uidt":"DateTime"},
  {"title":"expires_at","uidt":"DateTime"}
]')

# --- Published_Images Table (W12 output) ---
IMAGES_ID=$(create_table "Published_Images" '[
  {"title":"article_id","uidt":"Number"},
  {"title":"image_type","uidt":"SingleSelect","dtxp":"hero,og"},
  {"title":"r2_url","uidt":"URL"},
  {"title":"prompt_used","uidt":"LongText"}
]')

echo ""
echo "=== 4 Content Engine tables created ==="
echo ""
echo "Table IDs:"
echo "  Keywords:        $KEYWORDS_ID"
echo "  Articles:        $ARTICLES_ID"
echo "  Financial_Cache: $CACHE_ID"
echo "  Published_Images: $IMAGES_ID"
echo ""
echo "=== Next Steps ==="
echo "1. In NocoDB UI: Published_Images -> add LinkToAnotherRecord field to Articles"
echo "2. Create read-only API token: Settings > API Tokens > New (Role: Viewer)"
echo "3. Add indexes via Postgres (connect to nocodb_db container):"
echo ""
echo "   docker exec -it \$(docker ps -q -f name=nocodb_db) psql -U nocodb -d nocodb -c \""
echo "   CREATE INDEX idx_keywords_status_score ON Keywords (status, priority_score DESC, blog);"
echo "   CREATE INDEX idx_articles_status_pub ON Articles (status, published_at DESC, blog);"
echo "   CREATE INDEX idx_articles_ticker ON Articles (ticker, sector);"
echo "   CREATE UNIQUE INDEX idx_cache_ticker_type ON Financial_Cache (ticker, data_type);"
echo "   \""
echo ""
echo "4. Test API:"
echo "   curl -s $NOCODB_URL/api/v2/meta/bases/$BASE_ID/tables -H '$HEADER' | python3 -c 'import sys,json; [print(t[\"title\"]) for t in json.load(sys.stdin).get(\"list\",[]))]'"
echo ""
echo "5. Expose via Traefik (already configured in docker-compose.yml):"
echo "   https://db.earlyinsider.com"
