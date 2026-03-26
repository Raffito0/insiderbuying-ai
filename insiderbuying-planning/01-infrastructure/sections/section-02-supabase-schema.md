# Section 02: Supabase Project + Schema

## Objective
Create a new Supabase project for InsiderBuying.ai. Apply the database schema for user profiles, subscriptions, insider alerts (with Realtime), alert preferences, articles cache, reports, and newsletter subscribers. Configure auth providers and RLS policies.

## Context
This is a brand new Supabase project — separate from the Toxic or Nah instance. Supabase handles auth (email + Google OAuth), real-time alert delivery, and subscription state. NocoDB (Section 01) handles the workflow data.

## Implementation

### 1. Create Supabase Project
Via Supabase dashboard (or Management API if available):
- Organization: create new or use existing
- Project name: `insiderbuying-ai`
- Database password: generate strong password
- Region: US East (closest to target audience)
- Plan: Free tier initially

Store these immediately:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### 2. Schema Migration
Create SQL migration file at `supabase/migrations/20260326000000_insiderbuying_schema.sql`:

**Tables to create:**

`profiles` — extends auth.users:
- id (UUID, PK, references auth.users)
- display_name (TEXT)
- subscription_tier (TEXT, default 'free', check in 'free','pro')
- stripe_customer_id (TEXT, unique)
- stripe_subscription_id (TEXT, unique)
- created_at (TIMESTAMPTZ, default now())

`subscriptions` — Stripe subscription records:
- id (UUID, PK, gen_random_uuid)
- user_id (UUID, references auth.users, not null)
- stripe_subscription_id (TEXT, unique, not null)
- plan (TEXT, check in 'free','pro')
- status (TEXT, check in 'active','canceled','past_due','trialing')
- current_period_start (TIMESTAMPTZ)
- current_period_end (TIMESTAMPTZ)
- cancel_at_period_end (BOOLEAN, default false)
- created_at (TIMESTAMPTZ, default now())

`insider_alerts` — real-time alert feed:
- id (UUID, PK, gen_random_uuid)
- ticker (TEXT, not null)
- company_name (TEXT)
- insider_name (TEXT, not null)
- insider_title (TEXT)
- transaction_type (TEXT, check in 'buy','sell')
- shares (INTEGER)
- price_per_share (NUMERIC(10,2))
- total_value (NUMERIC(14,2))
- filing_date (DATE)
- significance_score (INTEGER, check 1-10)
- ai_analysis (TEXT) — blurred for free users (filtering in API, not RLS)
- cluster_id (UUID)
- is_cluster_buy (BOOLEAN, default false)
- raw_filing_data (JSONB)
- created_at (TIMESTAMPTZ, default now())

`user_alert_preferences`:
- id (UUID, PK, gen_random_uuid)
- user_id (UUID, references auth.users, unique)
- email_enabled (BOOLEAN, default true)
- push_enabled (BOOLEAN, default false)
- min_significance_score (INTEGER, default 6)
- watched_tickers (TEXT[])
- sectors (TEXT[])
- created_at (TIMESTAMPTZ, default now())

`articles_cache` — denormalized from NocoDB for fast SSR:
- id (UUID, PK, gen_random_uuid)
- nocodb_record_id (TEXT, unique)
- slug (TEXT, unique, not null)
- title (TEXT, not null)
- meta_description (TEXT)
- body_html (TEXT)
- key_takeaways (TEXT)
- verdict_type (TEXT)
- ticker (TEXT)
- hero_image_url (TEXT)
- published_at (TIMESTAMPTZ)
- word_count (INTEGER)

`reports`:
- id (UUID, PK, gen_random_uuid)
- user_id (UUID, references auth.users)
- report_type (TEXT, check in 'data_study','premium','lead_magnet')
- title (TEXT)
- stripe_payment_id (TEXT)
- pdf_url (TEXT)
- created_at (TIMESTAMPTZ, default now())

`newsletter_subscribers`:
- id (UUID, PK, gen_random_uuid)
- email (TEXT, unique, not null)
- source (TEXT, default 'site')
- subscribed_at (TIMESTAMPTZ, default now())
- unsubscribed_at (TIMESTAMPTZ)

### 3. RLS Policies

Enable RLS on all tables. Policies:

**profiles**:
- SELECT: `auth.uid() = id` (users read own profile)
- UPDATE: `auth.uid() = id` (users update own profile)
- Service role bypasses RLS for admin operations

**subscriptions**:
- SELECT: `auth.uid() = user_id`

**insider_alerts**:
- SELECT: open to all authenticated users (basic data public, ai_analysis filtered in API route by subscription tier)

**user_alert_preferences**:
- ALL: `auth.uid() = user_id`

**articles_cache**:
- SELECT: open to all (public content)

**reports**:
- SELECT: `auth.uid() = user_id`

**newsletter_subscribers**:
- INSERT: open (email capture from landing page — anon or authenticated)
- SELECT/UPDATE/DELETE: service role only

### 4. Realtime
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE insider_alerts;
```

### 5. Auth Configuration
- Email/password: enabled with email confirmation
- Google OAuth: configure provider with client ID + secret
- Redirect URL: `https://insiderbuying.ai/api/auth/callback`
- Site URL: `https://insiderbuying.ai`

### 6. Profile Creation Trigger
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### 7. Indexes
```sql
CREATE INDEX idx_insider_alerts_ticker ON insider_alerts(ticker);
CREATE INDEX idx_insider_alerts_created ON insider_alerts(created_at DESC);
CREATE INDEX idx_insider_alerts_score ON insider_alerts(significance_score DESC);
CREATE INDEX idx_articles_cache_slug ON articles_cache(slug);
CREATE INDEX idx_articles_cache_published ON articles_cache(published_at DESC);
```

## Tests
```
# Test: Supabase client connects with anon key (basic query succeeds)
# Test: signup creates auth.user + profiles row with tier='free'
# Test: login returns valid session
# Test: RLS: anon cannot read profiles
# Test: RLS: user can read own profile but not others
# Test: RLS: authenticated user can read insider_alerts
# Test: RLS: articles_cache is publicly readable
# Test: Realtime: INSERT into insider_alerts fires subscription event
# Test: user_alert_preferences: user can CRUD own preferences
# Test: newsletter_subscribers: anon can INSERT (email capture works)
# Test: indexes exist on key columns
```

## Acceptance Criteria
- [ ] Supabase project created with valid credentials
- [ ] All 7 tables created with correct column types and constraints
- [ ] RLS policies enforce access control correctly
- [ ] Realtime enabled on insider_alerts
- [ ] Auth: email signup + Google OAuth configured
- [ ] Profile trigger creates row on user signup
- [ ] Indexes on frequently queried columns
