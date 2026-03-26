#!/bin/bash
# NocoDB Table Setup Script for InsiderBuying.ai
# Run after NocoDB is up: bash setup-tables.sh <NOCODB_URL> <API_TOKEN>
#
# Usage:
#   1. Start NocoDB: docker-compose up -d
#   2. Open NocoDB UI, create API token in Settings > API Tokens
#   3. Run: bash setup-tables.sh http://localhost:8080 <your-api-token>

NOCODB_URL="${1:-http://localhost:8080}"
API_TOKEN="${2}"

if [ -z "$API_TOKEN" ]; then
  echo "Usage: bash setup-tables.sh <NOCODB_URL> <API_TOKEN>"
  echo "Example: bash setup-tables.sh http://localhost:8080 xc-abc123..."
  exit 1
fi

HEADER="xc-token: $API_TOKEN"

echo "=== Creating NocoDB base: InsiderBuying.ai ==="

# Create base
BASE_ID=$(curl -s -X POST "$NOCODB_URL/api/v2/meta/bases" \
  -H "$HEADER" \
  -H "Content-Type: application/json" \
  -d '{"title":"InsiderBuying.ai"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))")

if [ -z "$BASE_ID" ]; then
  echo "ERROR: Failed to create base. Check URL and API token."
  exit 1
fi

echo "Base created: $BASE_ID"

create_table() {
  local title="$1"
  local columns="$2"

  echo "Creating table: $title"
  RESPONSE=$(curl -s -X POST "$NOCODB_URL/api/v2/meta/bases/$BASE_ID/tables" \
    -H "$HEADER" \
    -H "Content-Type: application/json" \
    -d "{\"title\":\"$title\",\"columns\":$columns}")

  TABLE_ID=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
  echo "  -> Table ID: $TABLE_ID"
  echo "$TABLE_ID"
}

# Articles
create_table "Articles" '[
  {"title":"title","uidt":"SingleLineText"},
  {"title":"slug","uidt":"SingleLineText"},
  {"title":"meta_description","uidt":"SingleLineText"},
  {"title":"body_html","uidt":"LongText"},
  {"title":"key_takeaways","uidt":"LongText"},
  {"title":"verdict_type","uidt":"SingleSelect","dtxp":"BUY,SELL,CAUTION,WAIT,NO_TRADE"},
  {"title":"verdict_text","uidt":"LongText"},
  {"title":"word_count","uidt":"Number"},
  {"title":"primary_keyword","uidt":"SingleLineText"},
  {"title":"secondary_keywords","uidt":"SingleLineText"},
  {"title":"article_type","uidt":"SingleSelect","dtxp":"A,B,C,D"},
  {"title":"target_length","uidt":"SingleSelect","dtxp":"short,medium,long"},
  {"title":"ticker","uidt":"SingleLineText"},
  {"title":"company_name","uidt":"SingleLineText"},
  {"title":"sector","uidt":"SingleLineText"},
  {"title":"author_name","uidt":"SingleLineText"},
  {"title":"hero_image_url","uidt":"URL"},
  {"title":"og_image_url","uidt":"URL"},
  {"title":"status","uidt":"SingleSelect","dtxp":"draft,review,published"},
  {"title":"published_at","uidt":"DateTime"},
  {"title":"filing_citations_count","uidt":"Number"},
  {"title":"data_tables_count","uidt":"Number"},
  {"title":"confidence_notes","uidt":"LongText"}
]'

# Keywords
create_table "Keywords" '[
  {"title":"keyword","uidt":"SingleLineText"},
  {"title":"secondary_keywords","uidt":"SingleLineText"},
  {"title":"search_volume","uidt":"Number"},
  {"title":"keyword_difficulty","uidt":"Number"},
  {"title":"intent_type","uidt":"SingleSelect","dtxp":"A,B,C,D"},
  {"title":"ticker","uidt":"SingleLineText"},
  {"title":"company_name","uidt":"SingleLineText"},
  {"title":"status","uidt":"SingleSelect","dtxp":"new,assigned,used,exhausted"},
  {"title":"priority_score","uidt":"Number"},
  {"title":"last_checked","uidt":"DateTime"},
  {"title":"source","uidt":"SingleSelect","dtxp":"dataforseo,manual"}
]'

# Data_Studies
create_table "Data_Studies" '[
  {"title":"title","uidt":"SingleLineText"},
  {"title":"study_type","uidt":"SingleLineText"},
  {"title":"data_period","uidt":"SingleLineText"},
  {"title":"key_findings","uidt":"LongText"},
  {"title":"methodology","uidt":"LongText"},
  {"title":"charts_data","uidt":"LongText"},
  {"title":"status","uidt":"SingleSelect","dtxp":"draft,published"},
  {"title":"published_at","uidt":"DateTime"}
]'

# Insider_Alerts
create_table "Insider_Alerts" '[
  {"title":"ticker","uidt":"SingleLineText"},
  {"title":"company_name","uidt":"SingleLineText"},
  {"title":"insider_name","uidt":"SingleLineText"},
  {"title":"insider_title","uidt":"SingleLineText"},
  {"title":"transaction_type","uidt":"SingleSelect","dtxp":"buy,sell"},
  {"title":"shares","uidt":"Number"},
  {"title":"price_per_share","uidt":"Number"},
  {"title":"total_value","uidt":"Number"},
  {"title":"filing_date","uidt":"DateTime"},
  {"title":"significance_score","uidt":"Number"},
  {"title":"ai_analysis","uidt":"LongText"},
  {"title":"cluster_id","uidt":"SingleLineText"},
  {"title":"is_cluster","uidt":"Checkbox"},
  {"title":"raw_data","uidt":"LongText"},
  {"title":"status","uidt":"SingleSelect","dtxp":"new,processed,delivered"},
  {"title":"delivered_at","uidt":"DateTime"}
]'

# Outreach_Prospects
create_table "Outreach_Prospects" '[
  {"title":"name","uidt":"SingleLineText"},
  {"title":"email","uidt":"Email"},
  {"title":"website","uidt":"URL"},
  {"title":"domain_authority","uidt":"Number"},
  {"title":"type","uidt":"SingleSelect","dtxp":"blogger,newsletter,podcast"},
  {"title":"relevance_score","uidt":"Number"},
  {"title":"status","uidt":"SingleSelect","dtxp":"found,contacted,replied,linked"},
  {"title":"notes","uidt":"LongText"}
]'

# Outreach_Log
create_table "Outreach_Log" '[
  {"title":"email_type","uidt":"SingleSelect","dtxp":"initial,followup"},
  {"title":"sent_at","uidt":"DateTime"},
  {"title":"opened_at","uidt":"DateTime"},
  {"title":"replied_at","uidt":"DateTime"},
  {"title":"result","uidt":"SingleSelect","dtxp":"no_reply,positive,negative,linked"}
]'

# X_Engagement_Log
create_table "X_Engagement_Log" '[
  {"title":"tweet_id","uidt":"SingleLineText"},
  {"title":"tweet_text","uidt":"LongText"},
  {"title":"type","uidt":"SingleSelect","dtxp":"post,reply"},
  {"title":"likes","uidt":"Number"},
  {"title":"retweets","uidt":"Number"},
  {"title":"replies_count","uidt":"Number"},
  {"title":"impressions","uidt":"Number"},
  {"title":"posted_at","uidt":"DateTime"}
]'

# Reddit_Log
create_table "Reddit_Log" '[
  {"title":"post_url","uidt":"URL"},
  {"title":"subreddit","uidt":"SingleLineText"},
  {"title":"comment_text","uidt":"LongText"},
  {"title":"type","uidt":"SingleSelect","dtxp":"value,mention"},
  {"title":"upvotes","uidt":"Number"},
  {"title":"posted_at","uidt":"DateTime"},
  {"title":"status","uidt":"SingleSelect","dtxp":"drafted,approved,posted"}
]'

# Financial_Cache
create_table "Financial_Cache" '[
  {"title":"ticker","uidt":"SingleLineText"},
  {"title":"data_type","uidt":"SingleSelect","dtxp":"income,balance,cashflow,ratios,prices,insider,competitor"},
  {"title":"data_json","uidt":"LongText"},
  {"title":"fetched_at","uidt":"DateTime"},
  {"title":"expires_at","uidt":"DateTime"}
]'

# Published_Images
create_table "Published_Images" '[
  {"title":"image_type","uidt":"SingleSelect","dtxp":"hero,og"},
  {"title":"image_url","uidt":"URL"},
  {"title":"prompt_used","uidt":"LongText"},
  {"title":"created_at","uidt":"DateTime"}
]'

# Lead_Magnet_Versions
create_table "Lead_Magnet_Versions" '[
  {"title":"month","uidt":"SingleLineText"},
  {"title":"title","uidt":"SingleLineText"},
  {"title":"pdf_url","uidt":"URL"},
  {"title":"backtest_period","uidt":"SingleLineText"},
  {"title":"key_stats","uidt":"LongText"},
  {"title":"beehiiv_updated","uidt":"Checkbox"},
  {"title":"created_at","uidt":"DateTime"}
]'

# SEO_Rankings
create_table "SEO_Rankings" '[
  {"title":"date","uidt":"Date"},
  {"title":"position","uidt":"Number"},
  {"title":"clicks","uidt":"Number"},
  {"title":"impressions","uidt":"Number"},
  {"title":"ctr","uidt":"Number"}
]'

echo ""
echo "=== All 12 tables created! ==="
echo "Base ID: $BASE_ID"
echo ""
echo "Next: Create link fields manually in NocoDB UI:"
echo "  - Published_Images -> Articles (many-to-one)"
echo "  - Outreach_Log -> Outreach_Prospects (many-to-one)"
echo "  - X_Engagement_Log -> Articles (many-to-one)"
echo "  - SEO_Rankings -> Keywords (many-to-one)"
