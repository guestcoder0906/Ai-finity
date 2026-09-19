import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
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

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Stripe status check
  app.get('/api/stripe/status', (_req, res) => {
    const hasSecretKey = !!process.env.STRIPE_SECRET_KEY;
    const hasPub = !!process.env.VITE_STRIPE_PUBLISHABLE_KEY;
    const isLive = (process.env.STRIPE_SECRET_KEY || '').startsWith('sk_live_');

    res.json({
      configured: hasSecretKey,
      hasPublishableKey: hasPub,
      publishableKey: process.env.VITE_STRIPE_PUBLISHABLE_KEY || null,
      mode: isLive ? 'live' : 'test'
    });
  });

  // Create Stripe Checkout Session (Redirects to official Stripe checkout supporting GPay, Apple Pay, Cards)
  app.post('/api/stripe/create-checkout-session', async (req, res) => {
    try {
      const stripe = getStripe();
      if (!stripe) {
        return res.status(400).json({
          error: 'STRIPE_NOT_CONFIGURED',
          message: 'STRIPE_SECRET_KEY is not set in environment variables. Please add your Stripe Secret Key.'
        });
      }

      const { amount, itemName, itemType, itemId, actionDelta, userId, userEmail, username } = req.body;
      if (!amount || typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ error: 'INVALID_AMOUNT', message: 'Valid amount in USD is required.' });
      }

      const origin = req.headers.origin || `http://${req.headers.host || 'localhost:3000'}`;
      const amountInCents = Math.round(amount * 100);

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Aifinity: ${itemName || 'Market Purchase'}`,
              description: itemType === 'pack'
                ? `Action Pack (${actionDelta || 0} Actions) for ${username || 'Player'}`
                : `${itemName} Subscription for ${username || 'Player'}`
            },
            unit_amount: amountInCents
          },
          quantity: 1
        }],
        mode: 'payment',
        customer_email: userEmail && userEmail.includes('@') ? userEmail : undefined,
        metadata: {
          userId: String(userId || ''),
          username: String(username || ''),
          itemName: String(itemName || ''),
          itemType: String(itemType || ''),
          itemId: String(itemId || ''),
          actionDelta: String(actionDelta || 0),
          amount: String(amount)
        },
        success_url: `${origin}/?stripe_session_id={CHECKOUT_SESSION_ID}&stripe_status=success`,
        cancel_url: `${origin}/?stripe_status=cancelled`
      });

      res.json({
        url: session.url,
        sessionId: session.id
      });
    } catch (err: any) {
      console.error('Stripe Checkout Session creation error:', err);
      res.status(500).json({
        error: 'STRIPE_CHECKOUT_FAILED',
        message: err.message || 'Failed to create Stripe Checkout session.'
      });
    }
  });

  // Verify Stripe Checkout Session
  app.get('/api/stripe/verify-checkout-session', async (req, res) => {
    try {
      const stripe = getStripe();
      if (!stripe) {
        return res.status(400).json({
          error: 'STRIPE_NOT_CONFIGURED',
          message: 'STRIPE_SECRET_KEY is not set.'
        });
      }

      const sessionId = req.query.sessionId as string;
      if (!sessionId) {
        return res.status(400).json({ error: 'MISSING_SESSION_ID', message: 'Session ID is required.' });
      }

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const isPaid = session.payment_status === 'paid';

      res.json({
        paid: isPaid,
        sessionId: session.id,
        paymentIntentId: session.payment_intent,
        amount: (session.amount_total || 0) / 100,
        customerEmail: session.customer_details?.email || session.customer_email,
        metadata: session.metadata || {}
      });
    } catch (err: any) {
      console.error('Stripe Session retrieval error:', err);
      res.status(500).json({
        error: 'STRIPE_VERIFY_FAILED',
        message: err.message || 'Failed to verify session.'
      });
    }
  });

  // Process direct card / token payment with real Stripe Charge API
  app.post('/api/stripe/process-direct-payment', async (req, res) => {
    try {
      const stripe = getStripe();
      if (!stripe) {
        return res.status(400).json({
          error: 'STRIPE_NOT_CONFIGURED',
          message: 'STRIPE_SECRET_KEY is not set in environment variables. Please add your Stripe Secret Key in project settings.'
        });
      }

      const { token, amount, itemName, itemType, itemId, actionDelta, userId, userEmail, username } = req.body;
      if (!token) {
        return res.status(400).json({ error: 'MISSING_TOKEN', message: 'Payment token from Stripe is required.' });
      }
      if (!amount || typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ error: 'INVALID_AMOUNT', message: 'Valid amount is required.' });
      }

      const amountInCents = Math.round(amount * 100);

      // Create genuine Stripe charge
      const charge = await stripe.charges.create({
        amount: amountInCents,
        currency: 'usd',
        source: token,
        description: `Aifinity: ${itemName} for ${username || userId || 'Player'}`,
        receipt_email: userEmail && userEmail.includes('@') ? userEmail : undefined,
        metadata: {
          userId: String(userId || ''),
          username: String(username || ''),
          itemName: String(itemName || ''),
          itemType: String(itemType || ''),
          itemId: String(itemId || ''),
          actionDelta: String(actionDelta || 0),
          amount: String(amount)
        }
      });

      res.json({
        success: true,
        chargeId: charge.id,
        receiptUrl: charge.receipt_url,
        amount: charge.amount / 100,
        status: charge.status,
        paymentMethodDetails: charge.payment_method_details?.card
          ? `${charge.payment_method_details.card.brand.toUpperCase()} •••• ${charge.payment_method_details.card.last4}`
          : 'Card'
      });
    } catch (err: any) {
      console.error('Stripe direct charge error:', err);
      const stripeError = err.raw || err;
      res.status(400).json({
        error: stripeError.code || 'STRIPE_CHARGE_FAILED',
        message: stripeError.message || err.message || 'Payment processing failed.',
        declineCode: stripeError.decline_code
      });
    }
  });

  // Create Stripe PaymentIntent (supports Cards, Google Pay, Apple Pay automatically)
  app.post('/api/stripe/create-payment-intent', async (req, res) => {
    try {
      const stripe = getStripe();
      if (!stripe) {
        return res.status(400).json({
          error: 'STRIPE_NOT_CONFIGURED',
          message: 'STRIPE_SECRET_KEY is not set in environment variables. Please add your Stripe Secret Key.'
        });
      }

      const { amount, itemName, itemType, userEmail, username } = req.body;
      if (!amount || typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ error: 'INVALID_AMOUNT', message: 'Valid amount in USD is required.' });
      }

      // Convert amount in dollars to cents
      const amountInCents = Math.round(amount * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency: 'usd',
        automatic_payment_methods: {
          enabled: true
        },
        description: `Aifinity: ${itemName || 'Market Purchase'}`,
        metadata: {
          itemName: String(itemName || ''),
          itemType: String(itemType || ''),
          userEmail: String(userEmail || ''),
          username: String(username || '')
        }
      });

      res.json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id
      });
    } catch (err: any) {
      console.error('Stripe PaymentIntent creation error:', err);
      res.status(500).json({
        error: 'STRIPE_PAYMENT_INTENT_FAILED',
        message: err.message || 'Failed to initialize payment.'
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Aifinity server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
