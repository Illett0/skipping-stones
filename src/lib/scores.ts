import type { ScoreRecord, StageId } from "@/game/types";
import { getSupabase } from "./supabase";

const LOCAL_KEY = "skipping-stones:scores";
const NAME_KEY = "skipping-stones:player-name";

function readLocal(): ScoreRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as ScoreRecord[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(records: ScoreRecord[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(records.slice(-300)));
  } catch {
    // 保存できない環境では何もしない
  }
}

export const isOnline = () => getSupabase() !== null;

export async function saveScore(record: ScoreRecord): Promise<void> {
  const supabase = getSupabase();
  if (supabase) {
    const { error } = await supabase.from("scores").insert({
      player_name: record.player_name,
      stage_id: record.stage_id,
      bounces: record.bounces,
      distance: Math.round(record.distance * 10) / 10,
      weather: record.weather,
    });
    if (!error) return;
    console.warn("Supabase への保存に失敗したため端末に保存します", error.message);
  }
  writeLocal([...readLocal(), { ...record, id: crypto.randomUUID(), created_at: new Date().toISOString() }]);
}

export async function fetchTopScores(stageId: StageId, limit = 10): Promise<ScoreRecord[]> {
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from("scores")
      .select("id, player_name, stage_id, bounces, distance, weather, created_at")
      .eq("stage_id", stageId)
      .order("bounces", { ascending: false })
      .order("distance", { ascending: false })
      .limit(limit);
    if (!error && data) return data as ScoreRecord[];
    console.warn("Supabase からの取得に失敗したため端末の記録を表示します", error?.message);
  }
  return readLocal()
    .filter((r) => r.stage_id === stageId)
    .sort((a, b) => b.bounces - a.bounces || b.distance - a.distance)
    .slice(0, limit);
}

export function loadPlayerName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function storePlayerName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // 無視
  }
}
