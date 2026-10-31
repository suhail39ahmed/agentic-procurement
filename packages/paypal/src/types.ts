export type Money = { currency_code: string; value: string };
export type PayPalEnv = "sandbox";
export interface PayPalConfig { clientId: string; clientSecret: string; env: PayPalEnv }
export interface CreateOrderInput { poId: string; amount: Money; payeeEmail: string; description?: string; returnUrl?: string; cancelUrl?: string }
