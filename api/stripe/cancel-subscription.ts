import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

function getStripe(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return null;
  }
  if (!stripeClient) {
    stripeClient = new Stripe(secretKey);
  }
  return stripeClient;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Only POST is allowed.' });
  }

  try {
    const { userId, subscriptionId } = req.body || {};
    if (!userId && !subscriptionId) {
      return res.status(400).json({ error: 'MISSING_PARAMS', message: 'User ID or Subscription ID is required.' });
    }

    const stripe = getStripe();
    if (!stripe) {
      return res.status(400).json({ error: 'STRIPE_NOT_CONFIGURED', message: 'Stripe is not configured.' });
    }

    let subToCancelId = subscriptionId;

    if (!subToCancelId) {
      const subs = await stripe.subscriptions.list({ limit: 100, status: 'active' });
      for (const s of subs.data) {
        if (s.metadata?.userId === userId) {
          subToCancelId = s.id;
          break;
        }
      }
    }

    if (!subToCancelId) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'No active subscription found for this account.' });
    }

    const cancelledSub = await stripe.subscriptions.cancel(subToCancelId);

    return res.status(200).json({
      success: true,
      message: 'Monthly subscription successfully cancelled.',
      status: cancelledSub.status,
      subscriptionId: cancelledSub.id
    });
  } catch (err: any) {
    console.error('Vercel API Cancel Subscription Error:', err);
    return res.status(500).json({ error: 'CANCEL_FAILED', message: err.message });
  }
}
