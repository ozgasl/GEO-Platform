/**
 * iyzico Sandbox Subscription Test
 * Run: node scripts/test-iyzico-sandbox.mjs
 *
 * Tests: subscription plan create → checkout form init → plan list → cleanup
 * This is a pre-integration sanity check, not part of the app.
 */

import Iyzipay from 'iyzipay'

const API_KEY    = process.env.IYZIPAY_API_KEY    ?? 'sandbox-xxxxxx'
const SECRET_KEY = process.env.IYZIPAY_SECRET_KEY ?? 'sandbox-xxxxxx'
const BASE_URL   = 'https://sandbox-api.iyzipay.com'

const iyzipay = new Iyzipay({ apiKey: API_KEY, secretKey: SECRET_KEY, uri: BASE_URL })

const ok  = s => `\x1b[32m✓ ${s}\x1b[0m`
const err = s => `\x1b[31m✗ ${s}\x1b[0m`
const dim = s => `\x1b[2m  ${s}\x1b[0m`

function check(label, res) {
  const success = res?.status === 'success'
  console.log(success ? ok(label) : err(label))
  if (!success) console.log(dim(JSON.stringify(res, null, 2).slice(0, 400)))
  return success
}

// Promisify iyzipay callbacks
const p = fn => (...args) => new Promise((resolve, reject) => {
  try {
    fn(...args, (err, result) => err ? reject(err) : resolve(result))
  } catch (e) {
    reject(e)
  }
})

async function main() {
  console.log('\n\x1b[1miyzico Sandbox Subscription Test\x1b[0m')
  console.log(`Base URL: ${BASE_URL}\n`)

  // 1. Create a subscription plan
  const planRef = `geo-starter-test-${Date.now()}`
  const createPlanRes = await p(iyzipay.subscriptionPlans.create.bind(iyzipay.subscriptionPlans))({
    locale: 'tr',
    name: 'GEO Starter Test',
    price: '1000.00',
    currencyCode: 'TRY',
    paymentInterval: 'MONTHLY',
    paymentIntervalCount: 1,
    trialPeriodDays: 0,
    planPaymentType: 'RECURRING',
  }).catch(e => ({ status: 'failure', errorMessage: e.message }))

  if (!check('Create subscription plan', createPlanRes)) {
    console.log('\n\x1b[33mNote: iyzico may require subscription feature to be enabled in your merchant panel.\x1b[0m')
    process.exit(1)
  }

  const planReferenceCode = createPlanRes.data?.referenceCode
  console.log(dim(`Plan reference: ${planReferenceCode}`))

  // 2. List plans (confirm it exists)
  const listRes = await p(iyzipay.subscriptionPlans.retrieve.bind(iyzipay.subscriptionPlans))({
    locale: 'tr',
    referenceCode: planReferenceCode,
  }).catch(e => ({ status: 'failure', errorMessage: e.message }))

  check('Retrieve subscription plan', listRes)

  // 3. Init a checkout form for a test subscriber
  const checkoutRes = await p(iyzipay.subscriptionCheckoutForms.initialize.bind(iyzipay.subscriptionCheckoutForms))({
    locale: 'tr',
    callbackUrl: 'https://geo-platform-alpha.vercel.app/api/payments/callback',
    planReferenceCode,
    customer: {
      name: 'Test',
      surname: 'User',
      email: 'test@geo-platform.local',
      identityNumber: '11111111111',
      gsmNumber: '+905551234567',
      billingAddress: {
        contactName: 'Test User',
        city: 'Istanbul',
        country: 'Turkey',
        address: 'Test Mah. Test Cad. No:1',
        zipCode: '34000',
      },
    },
  }).catch(e => ({ status: 'failure', errorMessage: e.message }))

  const checkoutOk = check('Initialize checkout form', checkoutRes)
  if (checkoutOk) {
    console.log(dim(`Checkout token: ${checkoutRes.data?.checkoutFormContent?.slice(0, 80)}...`))
  }

  // 4. Delete test plan (cleanup)
  const deleteRes = await p(iyzipay.subscriptionPlans.delete.bind(iyzipay.subscriptionPlans))({
    locale: 'tr',
    referenceCode: planReferenceCode,
  }).catch(e => ({ status: 'failure', errorMessage: e.message }))

  check('Delete test plan (cleanup)', deleteRes)

  // Summary
  console.log('\n' + '═'.repeat(50))
  const allOk = [createPlanRes, listRes, checkoutRes, deleteRes].every(r => r?.status === 'success')
  if (allOk) {
    console.log('\x1b[32m\x1b[1miyzico subscription API: READY ✓\x1b[0m')
    console.log('Safe to build v0.4 integration against iyzico.\n')
  } else {
    console.log('\x1b[31m\x1b[1miyzico subscription API: ISSUES FOUND\x1b[0m')
    console.log('Check errors above. May need to enable subscription feature in merchant panel.\n')
  }
}

main().catch(console.error)
