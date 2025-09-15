import express from 'express';
import Stripe from 'stripe';

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-08-27.basil',
});

// Raw body parser for Stripe webhooks
app.use('/webhook', express.raw({ type: 'application/json' }));

// Stripe webhook endpoint
app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.log(`❌ Webhook signature verification failed.`, err);
    return res.status(400).send(`Webhook Error: ${err}`);
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log(`✅ Payment succeeded: ${paymentIntent.id} - $${paymentIntent.amount / 100}`);

        // Log to RevBot memory system
        await logRevBotTransaction(paymentIntent);
        break;

      case 'payment_intent.payment_failed':
        const failedPayment = event.data.object as Stripe.PaymentIntent;
        console.log(`❌ Payment failed: ${failedPayment.id}`);
        break;

      case 'customer.created':
        const customer = event.data.object as Stripe.Customer;
        console.log(`👤 New customer: ${customer.id}`);
        break;

      default:
        console.log(`🔔 Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (err) {
    console.error(`❌ Webhook handler error:`, err);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

async function logRevBotTransaction(paymentIntent: Stripe.PaymentIntent) {
  try {
    // This would integrate with RevBot memory MCP
    const transactionData = {
      service_id: 'qr-generator-v1',
      amount: paymentIntent.amount / 100, // Convert to dollars
      customer_id: paymentIntent.customer as string,
      stripe_transaction_id: paymentIntent.id,
      metadata: paymentIntent.metadata,
    };

    console.log('💰 RevBot Transaction:', transactionData);

    // TODO: Call RevBot memory MCP record_transaction
    // This would be: await recordTransaction(transactionData);

  } catch (error) {
    console.error('❌ Failed to log RevBot transaction:', error);
  }
}

app.get('/webhook/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'RevBot Webhook Handler',
    timestamp: new Date().toISOString(),
  });
});

export default app;