import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '');

/** Charge the customer's card through Stripe. */
export async function charge(amount: number, paymentMethod: string): Promise<void> {
  await stripe.paymentIntents.create({
    amount: Math.round(amount * 100),
    currency: 'usd',
    payment_method: paymentMethod,
    confirm: true,
  });
}
