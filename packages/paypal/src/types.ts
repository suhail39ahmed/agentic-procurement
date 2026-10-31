export type Money = { currency_code: string; value: string };
export type PayPalEnv = "sandbox";
export interface PayPalConfig { clientId: string; clientSecret: string; env: PayPalEnv }
export interface CreateOrderInput { poId: string; amount: Money; /** Omit to make the app's own merchant the payee (needed to void, see client.ts). */ payeeEmail?: string; description?: string; returnUrl?: string; cancelUrl?: string }
