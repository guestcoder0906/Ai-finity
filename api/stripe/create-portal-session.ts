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
    const { userId, userEmail, username, origin: clientOrigin } = req.body || {};
    let origin = String(clientOrigin || req.headers?.referer || req.headers?.origin || '').trim();
    if (origin.endsWith('/')) origin = origin.slice(0, -1);
    if (!origin || origin === 'null') {
      const proto = req.headers?.['x-forwarded-proto'] || 'https';
      const host = req.headers?.['x-forwarded-host'] || req.headers?.host || 'www.aifinity-rpg.com';
      origin = `${proto}://${host}`;
    }
    if (!origin.startsWith('http://') && !origin.startsWith('https://')) {
      origin = `https://${origin}`;
    }
    origin = origin.replace(/\/+$/, '');

    const stripe = getStripe();
    if (!stripe) {
      return res.status(400).json({ error: 'STRIPE_NOT_CONFIGURED', message: 'Stripe is not configured in server environment.' });
    }

    let customerId: string | undefined;

    // 1. Search customers by email
    if (userEmail && userEmail.includes('@')) {
      const customers = await stripe.customers.list({ email: userEmail, limit: 10 }).catch(() => ({ data: [] }));
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      }
    }

    // 2. Search checkout sessions for customer ID if not found yet
    if (!customerId) {
      const sessions = await stripe.checkout.sessions.list({ limit: 100 }).catch(() => ({ data: [] }));
      for (const s of sessions.data) {
        const sEmail = (s.customer_details?.email || s.customer_email || s.metadata?.userEmail || '').toLowerCase().trim();
        const sUid = (s.metadata?.userId || '').trim();
        const sUsername = (s.metadata?.username || '').toLowerCase().trim();

        if (
          (userId && sUid === userId) ||
          (userEmail && sEmail === userEmail.toLowerCase()) ||
          (username && sUsername === username.toLowerCase())
        ) {
          if (s.customer) {
            customerId = typeof s.customer === 'string' ? s.customer : s.customer.id;
            break;
          }
        }
      }
    }

    // 3. Search subscriptions list for customer ID
    if (!customerId) {
      const subs = await stripe.subscriptions.list({ limit: 100, status: 'all' }).catch(() => ({ data: [] }));
      for (const sub of subs.data) {
        const subUid = (sub.metadata?.userId || '').trim();
        const subUsername = (sub.metadata?.username || '').toLowerCase().trim();
        if ((userId && subUid === userId) || (username && subUsername === username.toLowerCase())) {
          customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
          break;
        }
      }
    }

    if (!customerId) {
      return res.status(404).json({
        error: 'CUSTOMER_NOT_FOUND',
        message: 'No Stripe customer account was found for your user profile. If you subscribed using a different email, please check that email account.'
      });
    }

    // Create billing portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/?stripe_portal_return=true`
    });

    return res.status(200).json({
      success: true,
      url: portalSession.url
    });
  } catch (err: any) {
    console.error('Vercel API Create Customer Portal Session Error:', err);
    return res.status(500).json({
      error: 'PORTAL_ERROR',
      message: err.message || 'Failed to create Stripe Customer Portal session.'
    });
  }
}
