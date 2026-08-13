import type { RateConfig } from "@/domain/types";
import type { SuccessfulRequests } from "@/domain/settlement";
import { calculateSettlement } from "@/domain/settlement";

export type MeteringMode = "disabled" | "wallet";

export function resolveMeteringMode(value: string | null | undefined): MeteringMode {
  return value?.trim().toLocaleLowerCase("en-US") === "wallet" ? "wallet" : "disabled";
}

export function isMeteringEnabled(value: string | null | undefined = process.env.METERING_MODE) {
  return resolveMeteringMode(value) === "wallet";
}

export function billableEstimate(total: number, mode: MeteringMode) {
  return mode === "wallet" ? Math.max(0, total) : 0;
}

export function settleMetering(
  frozenPoints: number,
  requests: SuccessfulRequests,
  rate: RateConfig,
  mode: MeteringMode,
) {
  return mode === "wallet"
    ? calculateSettlement(frozenPoints, requests, rate)
    : { consumedPoints: 0, refundedPoints: 0 };
}
