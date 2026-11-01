from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from ..model import (
    BranchBeat,
    ChoiceBeat,
    JumpBeat,
    LoreBeat,
    MetaBeat,
    SayBeat,
    SceneBeat,
    TextRef,
)
from ..wire import (
    BEAT_BRANCH,
    BEAT_CHOICE,
    BEAT_JUMP,
    BEAT_LORE,
    BEAT_META,
    BEAT_SAY,
    BEAT_SCENE,
    SAY_MODE_CODE,
)
from .metrics import KINDS, WordCounter

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

_TITLE_PLACEHOLDERS = {"(title)", "{title}", "title", "（title）"}

_DICE_PREFIX = "骰子 "

_NEED_PREFIX = "需要 "


def _strip_prefix(table: dict[str, str], prefix: str) -> dict[str, str]:
    return {key[len(prefix):]: value for key, value in table.items() if key.startswith(prefix)}


class Renderer:
    def __init__(self, locale: dict[str, dict[str, str]], lang: str = "zh-tw",
                 counter: WordCounter | None = None,
                 lore_fallback: dict[str, str] | None = None) -> None:
        self.lang = lang if lang in _MENU_LABEL else "zh-tw"
        self.counter = counter or WordCounter()
        self.lore_fallback = lore_fallback or {}
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
        self.lore_fallback_count = 0
        self.lore_missing_count = 0
        self.lore_missing: list[str] = []
        self.character_ids: set[str] = set()

    def _story_text(self, key: str) -> str | None:
        text = self.story.get(key)
        if text is None:
            self.missing_count += 1
            if len(self.missing) < 400:
                self.missing.append(key)
        return text

    def _menu_label(self, name: str) -> str:
        return _MENU_LABEL[self.lang].get(name.lower(), name)

    def _cn(self, text: str) -> str:
        if self.lang != "zh-cn" or not text:
            return text
        for trad, simp in _PHRASE_CN:
            if trad in text:
                text = text.replace(trad, simp)
        return text

    def _ref(self, ref: TextRef | None) -> str:
        if ref is None:
            return ""
        if ref.keyed:
            text = self._story_text(ref.value)
            return text if text is not None else f"⚠{ref.value}"
        text = self.story.get(ref.value)
        if text is not None:
            return text
        return self._cn(ref.value)

    def _option(self, ref: TextRef) -> tuple[str, str]:
        if ref.keyed:
            return self._ref(ref), ""
        value = ref.value
        text = self.story.get(value)
        if text is not None:
            return text, ""
        if "+" in value and len(value) <= 120:
            return self._composite_option(value)
        if "|" in value:
            head, tail = value.split("|", 1)
            hit = self.story.get(head)
            return (hit or head) + f"（{tail}）", ""
        return self._cn(value), ""

    def _composite_option(self, value: str) -> tuple[str, str]:
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

    def _dice_note(self, cond: str) -> str:
        cond = (cond or "").strip()
        if not cond:
            return ""
        for token in ("<=", ">=", "<", ">"):
            if cond.startswith(token):
                return _DICE_PREFIX + _DICE_SYMBOL[token] + " " + cond[len(token):].strip()
        return _DICE_PREFIX + cond

    def _lock_text(self, ref: TextRef | None) -> str:
        if ref is None:
            return ""
        if ref.keyed:
            text = self._story_text(ref.value) if ref.value in self.story else None
        else:
            text = self.story.get(ref.value)
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

    def render(self, beats: Sequence[object]) -> list[list[Any]]:
        out: list[list[Any]] = []
        for beat in beats:
            if isinstance(beat, SayBeat):
                out.append(self._say(beat))
            elif isinstance(beat, ChoiceBeat):
                out.append(self._choice(beat))
            elif isinstance(beat, BranchBeat):
                row: list[Any] = [BEAT_BRANCH, self._cn(beat.label), self.render(beat.beats), beat.kind]
                if beat.group:
                    row.append(beat.group)
                out.append(row)
            elif isinstance(beat, JumpBeat):
                out.append([BEAT_JUMP, beat.target or "", self._cn(beat.label)])
            elif isinstance(beat, MetaBeat):
                if beat.kind == "story":
                    self._lore(beat.key, out)
                    continue
                label = self._meta(beat)
                if label:
                    if beat.kind == "dice":
                        out.append([BEAT_META, label, "dice", beat.key])
                    else:
                        out.append([BEAT_META, label])
            elif isinstance(beat, LoreBeat):
                self._lore(beat.key, out)
            elif isinstance(beat, SceneBeat):
                out.append([BEAT_SCENE, beat.name, beat.key, beat.next])
        return out

    def _say(self, beat: SayBeat) -> list[Any]:
        speaker = beat.speaker or ""
        if speaker:
            self.character_ids.add(speaker)
        text = self._ref(beat.ref)
        if "{size" in text:
            self.rich_count += 1
        code = SAY_MODE_CODE.get(beat.mode, 0)
        if code == 2:
            self.think_count += 1
            if speaker:
                self.think_named_count += 1
        self.counter.add(beat.mode if beat.mode in KINDS else "dialog", text)
        return [BEAT_SAY, speaker, text, code]

    def _choice(self, beat: ChoiceBeat) -> list[Any]:
        branches: list[list[Any]] = []
        for option in beat.options:
            text, need = self._option(option.ref)
            if "{size" in text:
                self.rich_count += 1
            notes = [note for note in (self._dice_note(option.note or ""), need) if note]
            self.option_count += 1
            self.counter.add("option", text)
            branches.append([text, " · ".join(notes), self.render(option.beats), self._lock_text(option.lock)])
        return [BEAT_CHOICE, branches]

    def _lore(self, key: str, out: list[list[Any]]) -> None:
        text = self.legend.get(key) or ""
        if not text:
            fallback = self.lore_fallback.get(key) or ""
            if fallback:
                text = self._cn(fallback)
                self.lore_fallback_count += 1
            else:
                self.lore_missing_count += 1
                if len(self.lore_missing) < 120:
                    self.lore_missing.append(key)
                return
        self.counter.add("lore", text)
        self.lore_count += 1
        out.append([BEAT_LORE, text])

    def _meta(self, beat: MetaBeat) -> str | None:
        kind = beat.kind
        key = beat.key
        value = beat.value
        cn = self.lang == "zh-cn"
        if kind == "stat":
            name = self.stats.get(key, key)
            return f"{name} {value:+d}" if isinstance(value, int) and value else name
        if kind == "rel":
            name = self.chars.get(key, key)
            word = "好感"
            return f"{name} {word} {value:+d}" if isinstance(value, int) and value else f"{name} {word}"
        if kind == "flag":
            name = self.flags.get(key, key)
            return f"{'标志' if cn else '旗標'}「{name}」= {value}"
        if kind == "setstat":
            return f"{self.stats.get(key, key)} = {value}"
        if kind == "setrel":
            return f"{self.chars.get(key, key)} 好感 = {value}"
        if kind == "book":
            return self._gain(f"《{self.books.get(key, key)}》", value)
        if kind == "misc":
            return self._gain(f"「{self.miscs.get(key, key)}」", value)
        if kind == "special":
            return self._gain(f"「{self.specials.get(key, key)}」", value)
        if kind == "talent":
            name = self.talents.get(key, key)
            prefix = "习得天赋" if cn else "習得天賦"
            return f"{prefix}「{name}」Lv.{value}"
        if kind == "library":
            prefix = "解锁图鉴" if cn else "解鎖圖鑑"
            return f"{prefix}「{self.library.get(key, key)}」"
        if kind == "mission":
            prefix = "触发任务" if cn else "觸發任務"
            return f"{prefix}「{key}」"
        if kind == "dice":
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
