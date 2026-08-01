"use client";

import type { Deal } from "@/lib/types";
import { ExternalLink, Star, Tag } from "lucide-react";
import { motion } from "framer-motion";

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `$${amount}`;
  }
}

export function DealCard({ deal, index = 0 }: { deal: Deal; index?: number }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.35 }}
      className="group relative overflow-hidden rounded-2xl border border-white/10 bg-ink-900/60 p-4 backdrop-blur-sm transition hover:border-tide-400/40 hover:bg-ink-800/70"
    >
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-tide-500/10 blur-2xl transition group-hover:bg-ember-500/15" />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] uppercase tracking-wider text-tide-300">
              {deal.category}
            </span>
            <span className="text-[11px] text-white/40">{deal.source}</span>
          </div>
          <h3 className="font-medium leading-snug text-sand-50">{deal.title}</h3>
          <p className="mt-1 text-sm text-white/55">{deal.meta}</p>
          <p className="mt-2 text-sm text-white/70">{deal.provider}</p>
        </div>
        <div className="text-right">
          <div className="font-display text-2xl text-sand-50">
            {formatMoney(deal.price, deal.currency)}
          </div>
          {deal.originalPrice ? (
            <div className="text-xs text-white/40 line-through">
              {formatMoney(deal.originalPrice, deal.currency)}
            </div>
          ) : null}
          {deal.savingsPct ? (
            <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-ember-500/15 px-1.5 py-0.5 text-[11px] text-ember-300">
              <Tag className="h-3 w-3" />
              {deal.savingsPct}% off
            </div>
          ) : null}
        </div>
      </div>
      <div className="relative mt-4 flex items-center justify-between">
        {deal.rating ? (
          <span className="inline-flex items-center gap-1 text-sm text-white/60">
            <Star className="h-3.5 w-3.5 fill-ember-400 text-ember-400" />
            {deal.rating.toFixed(1)}
          </span>
        ) : (
          <span />
        )}
        {deal.url ? (
          <a
            href={deal.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-tide-300 hover:text-tide-200"
          >
            Open
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>
    </motion.article>
  );
}
