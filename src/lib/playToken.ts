import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { STAGES } from "@/game/stages";
import type { StageId } from "@/game/types";
import type { PlaySeeds } from "@/game/verify";

/**
 * サーバー専用。プレイの種に署名し、記録の送信時に改ざんされていないか確かめる。
 * 署名の鍵は SCORE_SIGNING_SECRET（NEXT_PUBLIC_ を付けないのでブラウザには渡らない）。
 */
export interface PlayClaims extends PlaySeeds {
  sid: string;
  stage: StageId;
  iat: number;
}

/** 発行から何時間までの記録を受け付けるか */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

function secret(): string | null {
  const s = process.env.SCORE_SIGNING_SECRET;
  return s && s.length >= 32 ? s : null;
}

const sign = (payload: string, key: string) => createHmac("sha256", key).update(payload).digest("base64url");

export function issuePlayToken(stage: StageId): { token: string; claims: PlayClaims } | null {
  const key = secret();
  if (!key) return null;
  const claims: PlayClaims = {
    sid: randomUUID(),
    stage,
    fieldSeed: randomInt(0, 0xffffffff),
    condSeed: randomInt(0, 0xffffffff),
    iat: Date.now(),
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return { token: `${payload}.${sign(payload, key)}`, claims };
}

export function verifyPlayToken(token: unknown): PlayClaims | null {
  const key = secret();
  if (!key || typeof token !== "string" || token.length > 1000) return null;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  const expected = Buffer.from(sign(payload, key));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const c = JSON.parse(Buffer.from(payload, "base64url").toString()) as PlayClaims;
    if (!STAGES.some((s) => s.id === c.stage)) return null;
    if (Date.now() - c.iat > MAX_AGE_MS) return null;
    return c;
  } catch {
    return null;
  }
}
