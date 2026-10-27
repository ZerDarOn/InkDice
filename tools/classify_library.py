"""Idempotently classify structured, provenance-preserved workbook entries."""

from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path

from import_5e_library import DEFAULT_DB, ROOT


# Capability describes safe UI behavior, not whether the original Excel calculated it.
TAXONOMY = {
    "class": ("人物选项", "职业", "lookup", "等级特性及兼职需另行判定"),
    "background": ("人物选项", "背景", "selection", "自由选择和背景叙事不可自动代填"),
    "species": ("人物选项", "种族/物种", "selection", "5E 名称格未含完整机械特性"),
    "feat": ("人物选项", "专长", "text_only", "先决条件与效果未逐条规则化"),
    "fighting_style": ("能力", "战斗风格", "selection", "仅已适配效果参与数值计算"),
    "spell": ("法术", "法术", "lookup", "效果文字不等于可自动执行的规则"),
    "spell_progression": ("规则表", "施法进度", "text_only", "不能直接用作多职业或恢复计算"),
    "weapon": ("装备", "武器", "lookup", "攻击加值仍依人物熟练与装备状态"),
    "armor": ("装备", "护甲", "lookup", "原表动态 AC 公式尚未复刻；仅提供来源字段"),
    "item": ("装备", "普通物品", "lookup", "不等于奇物或魔法物品"),
    "tool": ("装备", "工具", "lookup", "工具行动效果需人工判定"),
    "weapon_mastery": ("装备", "武器精通", "text_only", "需判定角色是否具备精通资格"),
    "curio": ("装备", "奇物", "selection", "需要同调不等于已同调；物品效果不自动执行"),
    "magic_item": ("装备", "其他魔法物品/神器", "text_only", "与普通物品和奇物分开；效果需人工判定"),
    "reference": ("参考文献", "规则与资料正文", "text_only", "完整参考正文，不自动授予人物能力；请核对来源性质"),
    "class_feature": ("能力", "职业能力", "text_only", "不能仅由名称推断解锁等级"),
    "feature_option": ("能力", "职业能力选项", "selection", "需要职业、子职及已知数量约束"),
    "species_trait": ("能力", "种族特性", "text_only", "可能含子种或等级选择，不能自动赋予"),
    "creature": ("生物与据点", "魔宠/部署生物", "lookup", "召唤缩放未建模"),
    "bastion": ("生物与据点", "据点设施", "text_only", "建造、人员与指令流程未自动执行"),
}


def subcategory(kind: str, payload: dict) -> str:
    if kind == "reference":
        return str(payload.get("分类") or "")
    if kind in ("curio", "magic_item"):
        return str(payload.get("类型") or "")
    if kind == "spell":
        return str(payload.get("学派") or payload.get("派系") or payload.get("系别") or "").strip()
    if kind == "spell_progression":
        return str(payload.get("模式") or "").strip()
    if kind in ("feat", "fighting_style"):
        return str(payload.get("分类") or "专长").strip()
    if kind == "feature_option":
        return str(payload.get("分类") or "").strip()
    if kind == "class_feature":
        return str(payload.get("职业") or "").strip()
    if kind == "species_trait":
        return str(payload.get("种族") or "").strip()
    if kind == "armor":
        return str(payload.get("类型") or "").strip()
    if kind == "weapon":
        return str(payload.get("精通") or "").strip()
    if kind == "bastion":
        return str(payload.get("空间") or "").strip()
    return ""


def classify(database: Path) -> dict:
    db = sqlite3.connect(database)
    db.execute("PRAGMA foreign_keys = ON")
    db.executescript((ROOT / "schemas" / "content-library.sql").read_text(encoding="utf-8"))
    try:
        with db:
            for kind, row in TAXONOMY.items():
                db.execute("INSERT INTO library_taxonomy VALUES (?,?,?,?,?) "
                           "ON CONFLICT(kind) DO UPDATE SET domain=excluded.domain, "
                           "label=excluded.label, capability=excluded.capability, warning=excluded.warning",
                           (kind, *row))
            for entry_id, kind, payload_json in db.execute(
                "SELECT id, kind, payload_json FROM library_entries"
            ):
                if kind not in TAXONOMY:
                    raise ValueError(f"未定义类别：{kind}")
                payload = json.loads(payload_json)
                level = TAXONOMY[kind][2]
                db.execute("INSERT INTO library_entry_classifications VALUES (?,?,?,?) "
                           "ON CONFLICT(entry_id) DO UPDATE SET subcategory=excluded.subcategory, "
                           "classification_method=excluded.classification_method, "
                           "automation_level=excluded.automation_level",
                           (entry_id, subcategory(kind, payload), "source_range_and_payload", level))
        return dict(db.execute("SELECT t.domain, COUNT(*) FROM library_entry_classifications c "
                               "JOIN library_entries e ON e.id=c.entry_id "
                               "JOIN library_taxonomy t ON t.kind=e.kind GROUP BY t.domain"))
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, default=DEFAULT_DB)
    args = parser.parse_args()
    print(json.dumps(classify(args.database), ensure_ascii=False))
