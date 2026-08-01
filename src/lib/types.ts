import { z } from "zod";

export const BookingCategorySchema = z.enum([
  "flight",
  "hotel",
  "train",
  "event",
  "restaurant",
  "other",
]);

export type BookingCategory = z.infer<typeof BookingCategorySchema>;

export type Deal = {
  id: string;
  title: string;
  provider: string;
  category: BookingCategory;
  price: number;
  currency: string;
  originalPrice?: number;
  savingsPct?: number;
  rating?: number;
  meta: string;
  url?: string;
  source: "webcmd" | "demo" | "composio";
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  deals?: Deal[];
  createdAt: string;
};

export type ConnectedAccount = {
  id: string;
  toolkit: string;
  label: string;
  status: "ACTIVE" | "INITIATED" | "EXPIRED" | "FAILED" | "DEMO";
  redirectUrl?: string;
};

export type SetupStepId =
  | "welcome"
  | "os"
  | "runtime"
  | "webcmd"
  | "accounts"
  | "done";

export type SetupState = {
  completed: boolean;
  currentStep: SetupStepId;
  os: "macos" | "windows" | "linux" | "unknown";
  runtimeReady: boolean;
  webcmdReady: boolean;
  accountsLinked: number;
  skippedAccounts: boolean;
};

export const SearchRequestSchema = z.object({
  query: z.string().min(1).max(500),
  category: BookingCategorySchema.optional(),
  budget: z.number().positive().optional(),
  demo: z.boolean().optional(),
});

export const ChatRequestSchema = z.object({
  message: z.string().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .optional(),
});

export const ConnectAccountSchema = z.object({
  toolkit: z.string().min(1).max(64),
  userId: z.string().min(1).max(128).optional(),
});
