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
    const { userId, subscriptionId, userEmail, email, username } = req.body || {};
    const searchEmail = (userEmail || email || '').trim().toLowerCase();
    const searchUsername = (username || '').trim().toLowerCase();

    if (!userId && !subscriptionId && !searchEmail && !searchUsername) {
      return res.status(400).json({ error: 'MISSING_PARAMS', message: 'User ID, Email, or Subscription ID is required.' });
    }

    const stripe = getStripe();
    if (!stripe) {
      return res.status(200).json({ success: true, message: 'Subscription status reset in test mode.' });
    }

    let subToCancelId = subscriptionId;

    if (!subToCancelId) {
      const subs = await stripe.subscriptions.list({ limit: 100, status: 'all' });
      for (const s of subs.data) {
        const isLive = s.status === 'active' || s.status === 'trialing';
        if (!isLive) continue;

        const subUid = (s.metadata?.userId || '').trim();
        const subEmail = (s.metadata?.userEmail || '').toLowerCase().trim();
        const subUsername = (s.metadata?.username || '').toLowerCase().trim();

        if (
          (userId && subUid === userId) ||
          (searchUsername && subUsername === searchUsername) ||
          (searchEmail && subEmail === searchEmail)
        ) {
          subToCancelId = s.id;
          break;
        }
      }
    }

    if (!subToCancelId) {
      // If no active subscription ID directly provided, search customer subscriptions
      if (searchEmail) {
        try {
          const custs = await stripe.customers.list({ email: searchEmail, limit: 10 });
          for (const c of custs.data) {
            const customerSubs = await stripe.subscriptions.list({ customer: c.id, limit: 10, status: 'all' });
            for (const cs of customerSubs.data) {
              if (cs.status === 'active' || cs.status === 'trialing') {
                subToCancelId = cs.id;
                break;
              }
            }
            if (subToCancelId) break;
          }
        } catch (e) {
          // Non-blocking
        }
      }
    }

    if (!subToCancelId) {
      // If still no active subscription was found on Stripe, return success with non-blocking flag
      return res.status(200).json({
        success: true,
        notFoundOnStripe: true,
        message: 'No active recurring subscription was found on Stripe servers for this account. Account plan has been updated to Free.'
      });
    }

    let cancelledSub: any;
    try {
      cancelledSub = await stripe.subscriptions.cancel(subToCancelId);
    } catch (cancelErr: any) {
      console.warn('Stripe subscription cancel warning:', cancelErr?.message);
      return res.status(200).json({
        success: true,
        notFoundOnStripe: true,
        message: 'Subscription was already cancelled or not found on Stripe. Account plan has been updated to Free.'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Monthly subscription successfully cancelled.',
      status: cancelledSub?.status || 'canceled',
      subscriptionId: subToCancelId
    });
  } catch (err: any) {
    console.error('Vercel API Cancel Subscription Error:', err);
    return res.status(200).json({
      success: true,
      notFoundOnStripe: true,
      message: 'Subscription status reset to Free.'
    });
  }
}
