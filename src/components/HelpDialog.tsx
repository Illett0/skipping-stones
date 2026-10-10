"use client";

import { CloudRain, Footprints, Hand, Triangle, Wind, X, Zap } from "lucide-react";

const ITEMS = [
  { icon: <Hand size={20} />, title: "石選び", body: "底が平らで薄く、円や楕円に近い形、100g前後の石ほどよく跳ねます。重すぎる石は初速が出ず、軽すぎる石は風に負けます。" },
  { icon: <Footprints size={20} />, title: "立ち位置と向き", body: "川の流れは場所によって変わります。流れが速い所や波立つ所では跳ねにくくなります。斜めに投げれば対岸までの距離を稼げます。" },
  { icon: <Triangle size={18} />, title: "角度", body: "水面に浅く入るほど跳ねやすくなります。角度が急だと一投目で沈むこともあります。" },
  { icon: <Zap size={20} />, title: "力のゲージ", body: "往復するゲージを3回止めます。3回の合計が投げる力です。満タン付近で止めるほど速く飛びます。" },
  { icon: <Wind size={20} />, title: "風", body: "追い風は伸び、向かい風は失速します。横風は進路を曲げ、強い風は水面を波立たせます。" },
  { icon: <CloudRain size={20} />, title: "雨の日", body: "雨の日は風も川の流れも強くなりやすく、水面も荒れます。" },
];

export default function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <h2 id="help-title" className="headline-s" style={{ margin: 0 }}>
            遊び方のコツ
          </h2>
          <button className="icon-btn" style={{ marginLeft: "auto" }} onClick={onClose} aria-label="閉じる" autoFocus>
            <X size={22} />
          </button>
        </div>
        <ul className="list">
          {ITEMS.map((it) => (
            <li key={it.title} style={{ alignItems: "flex-start", padding: "10px 4px" }}>
              <span className="sheet__icon" style={{ width: 36, height: 36 }}>
                {it.icon}
              </span>
              <div>
                <div className="title-s">{it.title}</div>
                <div className="body-m muted">{it.body}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
