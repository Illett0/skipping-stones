import { STAGES } from "@/game/stages";
import type { StageId } from "@/game/types";
import { issuePlayToken } from "@/lib/playToken";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/** ステージに入るときに呼ぶ。河原・天候の種を発行して署名を付ける */
export async function POST(request: Request) {
  let stageId: unknown;
  try {
    ({ stageId } = (await request.json()) as { stageId?: unknown });
  } catch {
    return Response.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  if (!STAGES.some((s) => s.id === stageId)) return Response.json({ error: "ステージが不正です" }, { status: 400 });
  // オンラインランキングの設定がないときは、ブラウザ側で端末保存に切り替える
  if (!getSupabaseAdmin()) return Response.json({ error: "オンラインランキングは無効です" }, { status: 503 });
  const issued = issuePlayToken(stageId as StageId);
  if (!issued) return Response.json({ error: "オンラインランキングは無効です" }, { status: 503 });
  const { token, claims } = issued;
  return Response.json({ token, fieldSeed: claims.fieldSeed, condSeed: claims.condSeed });
}
