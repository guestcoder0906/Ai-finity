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
