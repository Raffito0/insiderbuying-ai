# Section 03: Stripe Products + Webhook Setup

## Objective
Create Stripe products, prices, and coupon for InsiderBuying.ai Pro subscriptions. This is configuration-only (no code yet — the webhook handler is in Section 04).

## Context
Pricing decided:
- Monthly: $24/month
- Annual: $19/month ($228/year, "Save 21%")
- Newsletter subscriber: first month $12 (coupon)
- No refunds, cancel anytime

## Implementation

### 1. Create Stripe Account
If not already done:
- Sign up at stripe.com
- Complete business verification for insiderbuying.ai
- Enable test mode for development

### 2. Create Products + Prices

**Product**: "InsiderBuying Pro"
- Description: "Real-time insider trading alerts with AI-powered analysis, premium reports, and priority notifications"

**Prices**:
- Monthly: $24.00/month, recurring, USD
- Annual: $228.00/year ($19/month), recurring, USD

Store the price IDs:
- `STRIPE_PRICE_ID_PRO_MONTHLY=price_xxx`
- `STRIPE_PRICE_ID_PRO_ANNUAL=price_xxx`

### 3. Create Coupon

**Coupon**: "SUBSCRIBER12"
- Type: amount_off
- Amount: $12.00 off
- Duration: once (first invoice only)
- Applies to: Pro Monthly price only
- Max redemptions: unlimited (or set a cap later)

This coupon is distributed via Beehiiv welcome sequence: new newsletter subscribers get a link like `https://insiderbuying.ai/pricing?coupon=SUBSCRIBER12`

Store: `STRIPE_COUPON_ID_SUBSCRIBER=SUBSCRIBER12`

### 4. Create Webhook Endpoint

In Stripe Dashboard → Developers → Webhooks:
- Endpoint URL: `https://insiderbuying.ai/api/webhooks/stripe`
- Events to listen for:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`
  - `invoice.paid`

Store: `STRIPE_WEBHOOK_SECRET=whsec_xxx`

### 5. Create Customer Portal Configuration
Stripe Customer Portal allows users to manage their subscription:
- Enable portal in Stripe Dashboard → Settings → Billing → Customer Portal
- Allow: cancel subscription, update payment method
- Disallow: switch plans (handle in-app), pause subscription
- Branding: InsiderBuying.ai logo, navy color scheme

### 6. Collect All Keys
For `.env.local`:
```
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_PRO_MONTHLY=price_...
STRIPE_PRICE_ID_PRO_ANNUAL=price_...
STRIPE_COUPON_ID_SUBSCRIBER=SUBSCRIBER12
```

## Tests
```
# Test: Stripe API key is valid (list products returns 200)
# Test: Pro product exists with correct name
# Test: Monthly price is $24.00 recurring
# Test: Annual price is $228.00 recurring (or $19/mo equivalent)
# Test: Coupon SUBSCRIBER12 exists, gives $12 off, duration=once
# Test: Webhook endpoint is registered and active
# Test: Webhook endpoint listens for all 6 required event types
# Test: Customer Portal is configured
```

## Acceptance Criteria
- [ ] Stripe account active (test mode)
- [ ] Pro product with Monthly + Annual prices
- [ ] SUBSCRIBER12 coupon configured
- [ ] Webhook endpoint registered for all events
- [ ] Customer Portal enabled
- [ ] All keys collected and documented
