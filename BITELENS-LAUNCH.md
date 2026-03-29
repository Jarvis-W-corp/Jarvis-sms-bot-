# BiteLens App Store Launch Checklist

Everything code-side is done. These are the account/deploy steps.

Privacy policy is LIVE at: https://jarvis-sms-bot.onrender.com/privacy

---

## Step 1: Deploy Supabase Edge Functions (10 min)

```bash
cd ~/ai-bot/projects/intake/intake-app

# Login to Supabase CLI (if not already)
npx supabase login

# Link to your project
npx supabase link --project-ref YOUR_PROJECT_REF

# Set the API key as a secret
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE

# Deploy both functions
npx supabase functions deploy scan-food
npx supabase functions deploy parse-food
```

Test it works:
```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/parse-food \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text": "2 eggs and toast with butter"}'
```

---

## Step 2: RevenueCat Setup (20 min)

1. Go to https://www.revenuecat.com and sign up
2. Create a new project called "BiteLens"
3. Add iOS app → paste your Apple bundle ID: `com.bitelens.app`
4. Get your iOS API key (starts with `appl_`)
5. Add to `.env` file:
   ```
   EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_YOUR_KEY
   ```
6. In RevenueCat dashboard, create:
   - **Entitlements:** `plus` and `pro`
   - **Products:** (these must match App Store Connect products)
     - `plus_monthly` — $4.99/month
     - `plus_annual` — $35.99/year
     - `pro_monthly` — $9.99/month
     - `pro_annual` — $59.99/year
   - **Offerings:** Create "default" offering with all 4 packages

---

## Step 3: EAS Build Setup (10 min)

```bash
cd ~/ai-bot/projects/intake/intake-app

# Login to Expo
npx eas-cli login

# Initialize project (generates project ID)
npx eas-cli init

# Build for iOS simulator first (no Apple Dev account needed)
npx eas build --platform ios --profile development

# When ready for TestFlight:
npx eas build --platform ios --profile production
```

---

## Step 4: App Store Connect (20 min)

1. Login to https://appstoreconnect.apple.com
2. Create new app:
   - Name: BiteLens
   - Bundle ID: com.bitelens.app
   - SKU: bitelens
3. Fill in:
   - Description: "AI-powered food scanner and nutrition tracker"
   - Category: Health & Fitness
   - Privacy Policy URL: https://jarvis-sms-bot.onrender.com/privacy
   - Screenshots (need iPhone 6.7" and 6.1")
4. Create In-App Purchases:
   - plus_monthly: $4.99
   - plus_annual: $35.99
   - pro_monthly: $9.99
   - pro_annual: $59.99
5. Submit for review

---

## Step 5: After Launch

- Run Apple Search Ads ($50-100 test budget)
- Target keywords: "food scanner", "calorie counter", "macro tracker", "AI nutrition"
- Monitor RevenueCat dashboard for conversions
- Goal: 100 downloads first week, 5% conversion to paid = $25-50/mo starting revenue

---

## What's Already Done (today)

- [x] scan-food Edge Function (code ready, needs deploy)
- [x] parse-food Edge Function (code ready, needs deploy)
- [x] Privacy policy (live at /privacy on Render)
- [x] purchases.ts (RevenueCat integration, needs API key)
- [x] EAS config (eas.json ready, needs project ID)
- [x] App icons exist in assets/
- [x] Full onboarding flow (8 steps)
- [x] Subscription tiers UI (Free/Plus/Pro)
- [x] All crash bugs fixed in Jarvis core
- [x] Discord spam eliminated
