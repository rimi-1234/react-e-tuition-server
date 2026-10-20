import Stripe from 'stripe';
import { env } from './env.js';

export const stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;
export const isStripeReady = () => Boolean(stripe);
