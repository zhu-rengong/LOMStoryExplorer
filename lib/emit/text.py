from __future__ import annotations

from collections.abc import Sequence
from typing import Any

_MENU_LABEL = {
    "zh-tw": {
        "talk": "交談", "exit": "離開", "battle": "戰鬥", "combat": "交手",
        "move": "移動", "shop": "購物", "work": "勞作", "alchemy": "煉丹",
        "craft": "打造", "forge": "打造", "rest": "休息", "meet": "會面",
        "train": "練功", "eat": "用膳", "event": "事件", "special": "特殊",
        "gift": "送禮", "visit": "拜訪", "patrol": "巡邏", "watch": "觀察",
        "help": "幫忙", "leave": "離開", "buy": "購買", "sell": "出售",
        "cook": "烹飪", "study": "研讀", "practice": "練習", "fight": "交手",
        "ask": "詢問", "give": "給予", "voyeur": "窺視", "pickwood": "拾柴",
        "change": "更換", "default": "行動",
    },
    "zh-cn": {
        "talk": "交谈", "exit": "离开", "battle": "战斗", "combat": "交手",
        "move": "移动", "shop": "购物", "work": "劳作", "alchemy": "炼丹",
        "craft": "打造", "forge": "打造", "rest": "休息", "meet": "会面",
        "train": "练功", "eat": "用膳", "event": "事件", "special": "特殊",
        "gift": "送礼", "visit": "拜访", "patrol": "巡逻", "watch": "观察",
        "help": "帮忙", "leave": "离开", "buy": "购买", "sell": "出售",
        "cook": "烹饪", "study": "研读", "practice": "练习", "fight": "交手",
        "ask": "询问", "give": "给予", "voyeur": "窥视", "pickwood": "拾柴",
        "change": "更换", "default": "行动",
    },
}

_PHRASE_CN = (
    ("其他情況", "其他情况"),
    ("分支判定", "分支判定"),
    ("骰子判定", "骰子判定"),
    ("場所事件", "场所事件"),
    ("條件", "条件"),
    ("屬性", "属性"),
    ("動態目標", "动态目标"),
    ("選項", "选项"),
)

_DICE_SYMBOL = {"<": "＜", "<=": "≤", ">": "＞", ">=": "≥"}

_SAY_KIND = {"dialog": 0, "narration": 1, "think": 2}

_TITLE_PLACEHOLDERS = {"(title)", "{title}", "title", "（title）"}

_DICE_PREFIX = "骰子 "

_NEED_PREFIX = "需要 "


def _strip_prefix(table: dict[str, str], prefix: str) -> dict[str, str]:
    return {key[len(prefix):]: value for key, value in table.items() if key.startswith(prefix)}


class Renderer:
    def __init__(self, locale: dict[str, dict[str, str]], lang: str = "zh-tw") -> None:
        self.lang = lang if lang in _MENU_LABEL else "zh-tw"
        self.story = locale.get("Story", {})
        self.chars = locale.get("Character", {})
        self.titles = locale.get("CharacterTitle", {})
        self.stats = locale.get("PlayerStat", {})
        self.flags = locale.get("Flag", {})
        self.dice = locale.get("DiceHeader", {})
        self.books = _strip_prefix(locale.get("Book", {}), "Name/")
        self.miscs = _strip_prefix(locale.get("Misc", {}), "Name/")
        self.specials = _strip_prefix(locale.get("Special", {}), "Name/")
        self.talents = _strip_prefix(locale.get("PlayerTalent", {}), "Name/")
        self.library = _strip_prefix(locale.get("Library", {}), "Title/")
        self.legend = locale.get("LegendInfo", {})
        self.missing: list[str] = []
        self.missing_count = 0
        self.option_count = 0
        self.locked_count = 0
        self.rich_count = 0
        self.think_count = 0
        self.think_named_count = 0
        self.lore_count = 0
        self.character_ids: set[str] = set()

    def _story_text(self, key: str) -> str | None:
        text = self.story.get(key)
        if text is None:
            self.missing_count += 1
            if len(self.missing) < 400:
                self.missing.append(key)
        return text

    def _menu_label(self, name: str) -> str:
        table = _MENU_LABEL[self.lang]
        return table.get(name.lower(), name)

    def _cn(self, text: str) -> str:
        if self.lang != "zh-cn" or not text:
            return text
        for trad, simp in _PHRASE_CN:
            if trad in text:
                text = text.replace(trad, simp)
        return text

    def _ref(self, pair: Sequence[str]) -> str:
        kind, value = pair[0], pair[1]
        if kind == "k":
            text = self._story_text(value)
            return text if text is not None else f"⚠{value}"
        text = self.story.get(value)
        if text is not None:
            return text
        return self._cn(value)

    def _option(self, pair: Sequence[str]) -> tuple[str, str]:
        kind, value = pair[0], pair[1]
        if kind == "k":
            return self._ref(pair), ""

        text = self.story.get(value)
        if text is not None:
            return text, ""

        if "+" in value and len(value) <= 120:
            parts = value.split("+")
            label = self._menu_label(parts[0])
            title = ""
            for part in parts[1:]:
                hit = self.story.get(part)
                if hit:
                    title = hit
                    break
            if not title:
                title = "｜".join(parts[1:])
            shown = f"{label}｜{title}" if title else label

            need: list[str] = []
            if len(parts) >= 4:
                try:
                    action, contribution = int(parts[2]), int(parts[3])
                except ValueError:
                    action = contribution = 0
                if action > 0:
                    need.append(("行動次數" if self.lang == "zh-tw" else "行动次数") + f" ≥ {action}")
                if contribution > 0:
                    need.append(("貢獻度" if self.lang == "zh-tw" else "贡献度") + f" ≥ {contribution}")
            return shown, (_NEED_PREFIX + " · ".join(need)) if need else ""

        if "|" in value:
            head, tail = value.split("|", 1)
            hit = self.story.get(head)
            return (hit or head) + f"（{tail}）", ""

        return self._cn(value), ""

    def _dice_note(self, cond: str) -> str:
        cond = (cond or "").strip()
        if not cond:
            return ""
        for token in ("<=", ">=", "<", ">"):
            if cond.startswith(token):
                return _DICE_PREFIX + _DICE_SYMBOL[token] + " " + cond[len(token):].strip()
        return _DICE_PREFIX + cond

    def _lock_text(self, pair: Sequence[str] | None) -> str:
        if not pair:
            return ""
        value = pair[1]
        if pair[0] == "t":
            text = self.story.get(value)
        else:
            text = self._story_text(value) if value in self.story else None
        if not text or len(text.strip()) <= 1:
            return ""
        self.locked_count += 1
        return text

    def char_name(self, char_id: str) -> str:
        if not char_id:
            return ""
        name = self.chars.get(char_id)
        title = self.titles.get(char_id)
        if title and title.strip().lower() in _TITLE_PLACEHOLDERS:
            title = None
        if name and title:
            return f"{name}（{title}）"
        return name or char_id

    def beats(self, beats: Sequence[list[Any]]) -> list[list[Any]]:
        out: list[list[Any]] = []
        for beat in beats:
            tag = beat[0]
            if tag == "say":
                speaker = beat[1] or ""
                if speaker:
                    self.character_ids.add(speaker)
                text = self._ref(beat[2])
                if "{size" in text:
                    self.rich_count += 1
                kind = _SAY_KIND.get(beat[3], 0)
                if kind == 2:
                    self.think_count += 1
                    if speaker:
                        self.think_named_count += 1
                out.append(["s", speaker, text, kind])
            elif tag == "choice":
                branches: list[list[Any]] = []
                for row in beat[1]:
                    ref, cond, sub = row[0], row[1], row[2]
                    lock = row[3] if len(row) > 3 else None
                    text, need = self._option(ref)
                    if "{size" in text:
                        self.rich_count += 1
                    notes = [note for note in (self._dice_note(cond or ""), need) if note]
                    self.option_count += 1
                    branches.append([text, " · ".join(notes), self.beats(sub), self._lock_text(lock)])
                out.append(["c", branches])
            elif tag == "branch":
                row = ["br", self._cn(beat[1]), self.beats(beat[2])]
                if len(beat) > 3 and beat[3]:
                    row.append(beat[3])
                if len(beat) > 4:
                    row.append(beat[4])
                out.append(row)
            elif tag == "jump":
                target = beat[1] or ""
                out.append(["j", target, self._cn(beat[2] or "")])
            elif tag == "meta":
                if beat[1] == "story":
                    key = beat[2]
                    out.append(["lore", self.legend.get(key) or key])
                    self.lore_count += 1
                    continue
                label = self._meta(beat)
                if label:
                    out.append(["m", label])
        return out

    def _meta(self, beat: Sequence[Any]) -> str | None:
        kind = beat[1]
        cn = self.lang == "zh-cn"
        if kind == "stat":
            key, delta = beat[2], beat[3]
            name = self.stats.get(key, key)
            return f"{name} {delta:+d}" if isinstance(delta, int) and delta else name
        if kind == "rel":
            key, delta = beat[2], beat[3]
            name = self.chars.get(key, key)
            word = "好感"
            return f"{name} {word} {delta:+d}" if isinstance(delta, int) and delta else f"{name} {word}"
        if kind == "flag":
            key, value = beat[2], beat[3]
            name = self.flags.get(key, key)
            return f"{'标志' if cn else '旗標'}「{name}」= {value}"
        if kind == "setstat":
            key, value = beat[2], beat[3]
            return f"{self.stats.get(key, key)} = {value}"
        if kind == "setrel":
            key, value = beat[2], beat[3]
            return f"{self.chars.get(key, key)} 好感 = {value}"
        if kind == "book":
            key, count = beat[2], beat[3]
            name = self.books.get(key, key)
            return self._gain(f"《{name}》", count)
        if kind == "misc":
            key, count = beat[2], beat[3]
            return self._gain(f"「{self.miscs.get(key, key)}」", count)
        if kind == "special":
            key, count = beat[2], beat[3]
            return self._gain(f"「{self.specials.get(key, key)}」", count)
        if kind == "talent":
            key, level = beat[2], beat[3]
            name = self.talents.get(key, key)
            prefix = "习得天赋" if cn else "習得天賦"
            return f"{prefix}「{name}」Lv.{level}"
        if kind == "library":
            key = beat[2]
            prefix = "解锁图鉴" if cn else "解鎖圖鑑"
            return f"{prefix}「{self.library.get(key, key)}」"
        if kind == "mission":
            prefix = "触发任务" if cn else "觸發任務"
            return f"{prefix}「{beat[2]}」"
        if kind == "dice":
            key = beat[2]
            return f"骰子判定「{self.dice.get(key, key)}」"
        return None

    def _gain(self, label: str, count: Any) -> str:
        cn = self.lang == "zh-cn"
        if isinstance(count, int) and count < 0:
            return f"失去{label}"
        if isinstance(count, int) and count > 1:
            return f"{'获得' if cn else '獲得'}{label}×{count}"
        return f"{'获得' if cn else '獲得'}{label}"

    def edge_label(self, raw: str) -> str:
        if not raw:
            return ""
        pieces = [piece.strip() for piece in raw.split(" / ")]
        out = []
        for piece in pieces:
            hit = self.story.get(piece)
            out.append(hit if hit else self._cn(piece))
        return " / ".join(out)

    def character_table(self) -> dict[str, str]:
        return {cid: self.char_name(cid) for cid in sorted(self.character_ids)}
