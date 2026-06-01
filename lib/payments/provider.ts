// lib/payments/provider.ts

export interface CheckoutSession {
  checkoutFormContent: string   // HTML/JS to embed, or a redirect URL
  referenceCode: string         // provider's session reference
}

export interface WebhookEvent {
  type: 'subscription.activated' | 'subscription.cancelled' | 'subscription.failed' | 'payment.success'
  subscriptionRef: string
  customerRef: string
  planRef?: string
  rawPayload: Record<string, unknown>
}

export interface PaymentProvider {
  /** Create a hosted checkout session for a subscription plan */
  createCheckoutSession(params: {
    planRef: string
    customerEmail: string
    customerName: string
    callbackUrl: string
  }): Promise<CheckoutSession>

  /** Parse and validate an incoming webhook request. Throws on invalid signature. */
  parseWebhook(payload: string, signature: string): Promise<WebhookEvent>

  /** Cancel an active subscription */
  cancelSubscription(subscriptionRef: string): Promise<void>
}

/** Placeholder — replace with iyzico or PayTR implementation in v0.4 payment sprint */
export class StubPaymentProvider implements PaymentProvider {
  async createCheckoutSession(): Promise<CheckoutSession> {
    throw new Error('Payment provider not configured. Coming soon.')
  }
  async parseWebhook(): Promise<WebhookEvent> {
    throw new Error('Payment provider not configured.')
  }
  async cancelSubscription(): Promise<void> {
    throw new Error('Payment provider not configured.')
  }
}

export const paymentProvider: PaymentProvider = new StubPaymentProvider()
