/**
 * Notification types and interfaces
 */

export interface NotificationConfig {
  email?: EmailConfig;
  whatsapp?: WhatsAppConfig;
  enabled: boolean;
}

export interface EmailConfig {
  enabled: boolean;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
  from: string;
  to: string[];
}

export interface WhatsAppConfig {
  enabled: boolean;
  provider: "twilio" | "whatsapp-business-api";
  twilio?: {
    accountSid: string;
    authToken: string;
    from: string; // WhatsApp number
  };
  whatsappBusinessApi?: {
    apiUrl: string;
    accessToken: string;
    phoneNumberId: string;
  };
  to: string[]; // WhatsApp numbers
}

export interface DailySummary {
  date: string;
  invoicesProcessed: number;
  invoicesAutoBooked: number;
  invoicesRequiringReview: number;
  errors: ErrorSummary[];
  actions: ActionSummary[];
}

export interface ErrorSummary {
  level: "error" | "warn";
  event: string;
  message: string;
  count: number;
  firstOccurred: string;
  lastOccurred: string;
  requiresHumanIntervention: boolean;
}

export interface ActionSummary {
  type: "contact_created" | "invoice_updated" | "invoice_created" | "invoice_deleted" | "auto_booked";
  count: number;
  details?: string[];
}

export interface WorkflowSummary {
  invoiceId: string;
  status: "success" | "error" | "review_required";
  action: string;
  confidence?: number;
  errors?: string[];
  requiresHumanIntervention: boolean;
}
