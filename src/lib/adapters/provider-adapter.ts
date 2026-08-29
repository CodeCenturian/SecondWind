import { getEnv } from "../env";

export interface CreatePaymentLinkParams {
  amountMinor: bigint | number;
  currency: string;
  description: string;
  customerName?: string | null;
  customerEmail?: string | null;
  customerContact?: string | null;
  referenceId: string; // Internal attempt idempotency/correlation key
  expireByUnix?: number;
  notes?: Record<string, string>;
}

export interface ProviderPaymentLinkResult {
  success: boolean;
  providerPaymentLinkId: string;
  shortUrl: string;
  status: string;
  amountMinor: bigint;
  currency: string;
  referenceId: string;
  rawResponse?: Record<string, unknown>;
  error?: string;
}

export interface ProviderPaymentStatusResult {
  success: boolean;
  paymentId: string;
  status: string;
  amountMinor: bigint;
  currency: string;
  captured: boolean;
  rawResponse?: Record<string, unknown>;
  error?: string;
}

export interface ProviderAdapter {
  createPaymentLink(params: CreatePaymentLinkParams): Promise<ProviderPaymentLinkResult>;
  fetchPaymentStatus(paymentId: string): Promise<ProviderPaymentStatusResult>;
}

/**
 * Real Razorpay Provider Adapter
 * Strictly adheres to verified API contracts in docs/razorpay-verification-checklist.md
 */
export class RazorpayAdapter implements ProviderAdapter {
  private keyId: string;
  private keySecret: string;
  private baseUrl: string;

  constructor(keyId?: string, keySecret?: string, baseUrl: string = "https://api.razorpay.com/v1") {
    const env = getEnv();
    this.keyId = keyId ?? env.RAZORPAY_KEY_ID;
    this.keySecret = keySecret ?? env.RAZORPAY_KEY_SECRET;
    this.baseUrl = baseUrl;
  }

  private getAuthHeader(): string {
    const credentials = `${this.keyId}:${this.keySecret}`;
    return `Basic ${Buffer.from(credentials).toString("base64")}`;
  }

  async createPaymentLink(params: CreatePaymentLinkParams): Promise<ProviderPaymentLinkResult> {
    const payload = {
      amount: Number(params.amountMinor),
      currency: params.currency.toUpperCase(),
      description: params.description,
      customer: {
        name: params.customerName || undefined,
        email: params.customerEmail || undefined,
        contact: params.customerContact || undefined,
      },
      notify: {
        sms: Boolean(params.customerContact),
        email: Boolean(params.customerEmail),
      },
      reminder_enable: false,
      reference_id: params.referenceId,
      expire_by: params.expireByUnix,
      notes: params.notes || {},
    };

    try {
      const response = await fetch(`${this.baseUrl}/payment_links`, {
        method: "POST",
        headers: {
          Authorization: this.getAuthHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data?.error?.description || `Razorpay API error HTTP ${response.status}`;
        return {
          success: false,
          providerPaymentLinkId: "",
          shortUrl: "",
          status: "FAILED",
          amountMinor: BigInt(params.amountMinor),
          currency: params.currency,
          referenceId: params.referenceId,
          error: errorMsg,
          rawResponse: data,
        };
      }

      return {
        success: true,
        providerPaymentLinkId: data.id,
        shortUrl: data.short_url,
        status: data.status,
        amountMinor: BigInt(data.amount),
        currency: data.currency,
        referenceId: data.reference_id || params.referenceId,
        rawResponse: data,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Network error calling Razorpay API";
      return {
        success: false,
        providerPaymentLinkId: "",
        shortUrl: "",
        status: "NETWORK_ERROR",
        amountMinor: BigInt(params.amountMinor),
        currency: params.currency,
        referenceId: params.referenceId,
        error: message,
      };
    }
  }

  async fetchPaymentStatus(paymentId: string): Promise<ProviderPaymentStatusResult> {
    try {
      const response = await fetch(`${this.baseUrl}/payments/${paymentId}`, {
        method: "GET",
        headers: {
          Authorization: this.getAuthHeader(),
        },
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          paymentId,
          status: "UNKNOWN",
          amountMinor: 0n,
          currency: "INR",
          captured: false,
          error: data?.error?.description || `HTTP ${response.status}`,
          rawResponse: data,
        };
      }

      return {
        success: true,
        paymentId: data.id,
        status: data.status,
        amountMinor: BigInt(data.amount),
        currency: data.currency,
        captured: Boolean(data.captured),
        rawResponse: data,
      };
    } catch (err: unknown) {
      return {
        success: false,
        paymentId,
        status: "ERROR",
        amountMinor: 0n,
        currency: "INR",
        captured: false,
        error: err instanceof Error ? err.message : "Fetch payment network failure",
      };
    }
  }
}

/**
 * Fake Razorpay Provider Adapter for offline testing and developer simulation.
 */
export class FakeRazorpayAdapter implements ProviderAdapter {
  public createdLinks: Map<string, ProviderPaymentLinkResult> = new Map();
  public shouldSimulateError: boolean = false;
  public simulatedErrorMessage: string = "Simulated provider error";

  async createPaymentLink(params: CreatePaymentLinkParams): Promise<ProviderPaymentLinkResult> {
    if (this.shouldSimulateError) {
      return {
        success: false,
        providerPaymentLinkId: "",
        shortUrl: "",
        status: "FAILED",
        amountMinor: BigInt(params.amountMinor),
        currency: params.currency,
        referenceId: params.referenceId,
        error: this.simulatedErrorMessage,
      };
    }

    const fakeId = `plink_test_${Math.random().toString(36).slice(2, 11)}`;
    const shortUrl = `https://rzp.io/i/${fakeId}`;

    const result: ProviderPaymentLinkResult = {
      success: true,
      providerPaymentLinkId: fakeId,
      shortUrl,
      status: "created",
      amountMinor: BigInt(params.amountMinor),
      currency: params.currency,
      referenceId: params.referenceId,
      rawResponse: {
        id: fakeId,
        short_url: shortUrl,
        status: "created",
        amount: Number(params.amountMinor),
        currency: params.currency,
      },
    };

    this.createdLinks.set(params.referenceId, result);
    return result;
  }

  async fetchPaymentStatus(paymentId: string): Promise<ProviderPaymentStatusResult> {
    return {
      success: true,
      paymentId,
      status: "captured",
      amountMinor: 50000n,
      currency: "INR",
      captured: true,
      rawResponse: { id: paymentId, status: "captured", captured: true },
    };
  }
}
