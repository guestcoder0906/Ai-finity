import { loadStripe, Stripe as StripeClient } from '@stripe/stripe-js';
import { UserProfile } from './authService';

let stripePromise: Promise<StripeClient | null> | null = null;

export function getClientStripe(publishableKey?: string | null): Promise<StripeClient | null> {
  const key =
    publishableKey ||
    (import.meta as any).env?.VITE_STRIPE_PUBLISHABLE_KEY ||
    '';

  if (!key) return Promise.resolve(null);

  if (!stripePromise) {
    stripePromise = loadStripe(key);
  }
  return stripePromise;
}

/**
 * Initiates an authentic Stripe Checkout session redirect.
 * If the Stripe server endpoint returns an error, it throws the real error so the user is informed
 * rather than recording any unverified transaction.
 */
export async function createRealStripeCheckoutSession(params: {
  amount: number;
  itemName: string;
  itemType: 'pack' | 'tier';
  itemId: string;
  actionDelta: number;
  user: UserProfile;
  origin?: string;
}): Promise<{ url: string; sessionId: string }> {
  const { amount, itemName, itemType, itemId, actionDelta, user, origin } = params;

  const clientOrigin =
    origin ||
    (typeof window !== 'undefined' ? window.location.origin : 'https://www.aifinity-rpg.com');

  const response = await fetch('/api/stripe/create-checkout-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      amount,
      itemName,
      itemType,
      itemId,
      actionDelta,
      userId: user.uid,
      userEmail: user.email || '',
      username: user.username || '',
      origin: clientOrigin
    })
  });

  const contentType = response.headers.get('content-type') || '';
  let data: any = null;

  if (contentType.includes('application/json')) {
    data = await response.json().catch(() => null);
  }

  if (!response.ok || !data || !data.url) {
    if (response.status === 404) {
      throw new Error(
        `Stripe server endpoint (/api/stripe/create-checkout-session) returned 404 Not Found. Make sure the Node/Express backend server is running and STRIPE_SECRET_KEY is configured in your deployment settings.`
      );
    }
    const errMessage =
      data?.message ||
      (data?.error === 'STRIPE_NOT_CONFIGURED'
        ? 'STRIPE_SECRET_KEY is missing in your server environment variables. Please add your live or test Stripe Secret Key in Settings.'
        : `Stripe checkout initiation failed (HTTP ${response.status}).`);
    
    const errorObj = new Error(errMessage);
    (errorObj as any).serverPayload = data;
    throw errorObj;
  }

  return {
    url: data.url,
    sessionId: data.sessionId
  };
}
