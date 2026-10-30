from __future__ import annotations

from pathlib import Path
from typing import Any

from ..model import Beat, BranchBeat, ChoiceBeat, ChoiceOption, JumpBeat, MetadataBeat, SayBeat, TextRef
from .jsout import write_language_index, write_language_stories
from .shards import ShardPlan

MENU_LABELS = {
    "zh-tw": {"talk": "交談", "exit": "離開", "battle": "戰鬥", "combat": "交手", "move": "移動",
              "shop": "購物", "work": "勞作", "alchemy": "煉丹", "craft": "打造", "rest": "休息",
              "meet": "會面", "train": "練功", "eat": "用膳", "event": "事件", "special": "特殊",
              "gift": "送禮", "visit": "拜訪", "help": "幫忙", "leave": "離開", "buy": "購買",
              "sell": "出售", "study": "研讀", "practice": "練習", "fight": "交手", "default": "行動"},
    "zh-cn": {"talk": "交谈", "exit": "离开", "battle": "战斗", "combat": "交手", "move": "移动",
              "shop": "购物", "work": "劳作", "alchemy": "炼丹", "craft": "打造", "rest": "休息",
              "meet": "会面", "train": "练功", "eat": "用膳", "event": "事件", "special": "特殊",
              "gift": "送礼", "visit": "拜访", "help": "帮忙", "leave": "离开", "buy": "购买",
              "sell": "出售", "study": "研读", "practice": "练习", "fight": "交手", "default": "行动"},
}
PHRASES = (("其他情況", "其他情况"), ("場所事件", "场所事件"), ("條件", "条件"), ("屬性", "属性"),
           ("動態目標", "动态目标"), ("選項", "选项"), ("旗標", "标志"), ("觸發", "触发"))
DICE_SYMBOLS = {"<=": "≤", ">=": "≥", "<": "<", ">": ">"}
TITLE_PLACEHOLDERS = {"(title)", "{title}", "title", "（title）"}


class Renderer:
    def __init__(self, locale: dict[str, dict[str, str]], lang: str = "zh-tw") -> None:
        self.locale = locale
        self.lang = lang if lang in MENU_LABELS else "zh-tw"
        self.story = locale.get("Story", {})
        self.characters = locale.get("Character", {})
        self.titles = locale.get("CharacterTitle", {})
        self.character_ids: set[str] = set()
        self.missing: list[str] = []
        self.missing_count = 0
        self.option_count = 0
        self.locked_count = 0
        self.rich_count = 0
        self.think_count = 0
        self.lore_count = 0

    def cn(self, text: str) -> str:
        if self.lang != "zh-cn":
            return text
        for traditional, simplified in PHRASES:
            text = text.replace(traditional, simplified)
        return text

    def story_text(self, key: str) -> str:
        value = self.story.get(key)
        if value is not None:
            return value
        self.missing_count += 1
        if len(self.missing) < 400:
            self.missing.append(key)
        return f"⟨{key}⟩"

    def ref(self, reference: TextRef) -> str:
        if reference.kind == "key":
            return self.story_text(reference.value)
        return self.story.get(reference.value, self.cn(reference.value))

    def character_name(self, character_id: str) -> str:
        name = self.characters.get(character_id, character_id)
        title = self.titles.get(character_id, "")
        if title and title.strip().lower() not in TITLE_PLACEHOLDERS:
            return f"{name}（{title}）"
        return name

    def render(self, beats: list[Beat]) -> list[list[Any]]:
        output: list[list[Any]] = []
        for beat in beats:
            if isinstance(beat, SayBeat):
                if beat.speaker:
                    self.character_ids.add(beat.speaker)
                text = self.ref(beat.text)
                self.rich_count += int("{size" in text)
                self.think_count += int(beat.mode == "think")
                output.append(["s", beat.speaker, text, beat.mode, beat.portrait])
            elif isinstance(beat, ChoiceBeat):
                output.append(["c", beat.menu, [self.option(option) for option in beat.options]])
            elif isinstance(beat, BranchBeat):
                output.append(["b", self.cn(beat.label), self.render(beat.body), beat.kind, beat.group])
            elif isinstance(beat, JumpBeat):
                output.append(["j", beat.target, self.cn(beat.label), beat.relation])
            elif isinstance(beat, MetadataBeat) and beat.kind == "story":
                output.append(["l", self.locale.get("LegendInfo", {}).get(beat.key, beat.key)])
                self.lore_count += 1
            elif isinstance(beat, MetadataBeat):
                label = self.metadata(beat)
                if label:
                    output.append(["m", label])
        return output

    def option(self, option: ChoiceOption) -> list[Any]:
        text, requirement = self.option_text(option)
        notes = []
        if option.dice:
            condition = option.dice.strip()
            symbol = next((DICE_SYMBOLS[token] for token in ("<=", ">=", "<", ">") if condition.startswith(token)), "")
            if symbol:
                condition = symbol + condition[len(symbol) if symbol in ("<", ">") else 2:]
            notes.append(("骰子 " if self.lang == "zh-tw" else "骰子 ") + condition)
        if requirement:
            notes.append(requirement)
        lock = self.ref(option.locked) if option.locked and len(option.locked.value.strip()) > 1 else ""
        self.locked_count += int(bool(lock))
        self.option_count += 1
        availability = self.cn(option.availability)
        return [text, " · ".join(notes), self.render(option.body), lock, availability, option.index]

    def option_text(self, option: ChoiceOption) -> tuple[str, str]:
        raw = option.raw or option.text.value
        localized = self.story.get(raw)
        if localized is not None:
            return localized, ""
        parts = raw.split("+")
        if len(parts) >= 4 and parts[2].isdigit() and parts[3].isdigit():
            action, contribution = int(parts[2]), int(parts[3])
            label = MENU_LABELS[self.lang].get(parts[0].lower(), parts[0])
            title = self.story.get(parts[1], parts[1])
            requirements = []
            if action:
                requirements.append(("行動次數" if self.lang == "zh-tw" else "行动次数") + f" ≥ {action}")
            if contribution:
                requirements.append(("貢獻度" if self.lang == "zh-tw" else "贡献度") + f" ≥ {contribution}")
            prefix = "需要 " if self.lang == "zh-tw" else "需要 "
            return f"{label}｜{title}", prefix + " · ".join(requirements) if requirements else ""
        if len(parts) == 3:
            return self.story.get(parts[2], parts[2]), ""
        return self.ref(option.text), ""

    def metadata(self, beat: MetadataBeat) -> str:
        cn = self.lang == "zh-cn"
        key, value, operation = beat.key, beat.value, beat.operation
        if beat.kind == "stat":
            name = self.locale.get("PlayerStat", {}).get(key, key)
            return self.change(name, value, operation, cn)
        if beat.kind == "rel":
            name = self.characters.get(key, key) + (" 好感" if cn else " 好感")
            return self.change(name, value, operation, cn)
        if beat.kind == "flag":
            name = self.locale.get("Flag", {}).get(key, key)
            label = "标志" if cn else "旗標"
            return self.change(f"{label}「{name}」", value, operation, cn)
        namespaces = {"book": "Book", "misc": "Misc", "special": "Special", "talent": "PlayerTalent",
                      "library": "Library"}
        if beat.kind in namespaces:
            table = self.locale.get(namespaces[beat.kind], {})
            name = table.get(f"Name/{key}") or table.get(f"Title/{key}") or table.get(key, key)
            if beat.kind == "library":
                return f"{'解锁图鉴' if cn else '解鎖圖鑑'}「{name}」"
            if beat.kind == "talent":
                return f"{'习得天赋' if cn else '習得天賦'}「{name}」Lv.{value}"
            return self.gain(name, value, cn)
        if beat.kind == "mission":
            return f"{'触发任务' if cn else '觸發任務'}「{key}」"
        if beat.kind == "dice":
            name = self.locale.get("DiceHeader", {}).get(key, key)
            return f"{'骰子判定' if cn else '骰子判定'}「{name}」"
        return ""

    @staticmethod
    def change(name: str, value: Any, operation: str, cn: bool) -> str:
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            if operation == "set":
                return f"{name} = {value:g}"
            if operation == "preview":
                return f"{name} {'变化' if cn else '變化'} {value:+g}"
            return f"{name} {value:+g}" if value else name
        if operation == "set":
            return f"{name} = {value}"
        return f"{name} {value}"

    @staticmethod
    def gain(name: str, count: Any, cn: bool) -> str:
        verb = "获得" if cn else "獲得"
        if isinstance(count, (int, float)) and count < 0:
            verb = "失去"
        suffix = f"×{count:g}" if isinstance(count, (int, float)) and count > 1 else ""
        return f"{verb}「{name}」{suffix}"

    def character_table(self) -> dict[str, str]:
        return {character_id: self.character_name(character_id) for character_id in sorted(self.character_ids)}


def write_language(directory: Path, lang: str, stories: dict[str, list], renderer: Renderer,
                   plan: ShardPlan, full_text: bool, version: int) -> dict[str, Any]:
    shards = [{**shard, "file": shard["file"].format(lang=lang)} for shard in plan.shards]
    index = {
        "version": version,
        "lang": lang,
        "characters": renderer.character_table(),
        "names": {
            "flags": renderer.locale.get("Flag", {}),
            "checks": renderer.locale.get("DiceHeader", {}),
            "stats": renderer.locale.get("PlayerStat", {}),
            "characters": renderer.characters,
        },
        "storyShards": {} if full_text else plan.assignment,
        "shards": [] if full_text else shards,
        "fullText": full_text,
        "stories": {},
    }
    index_name = f"stories-{lang}-index.js"
    total = write_language_index(directory / index_name, lang, index)
    files = {index_name}
    if full_text:
        name = f"stories-{lang}.js"
        total += write_language_stories(directory / name, lang, {"version": version, "lang": lang, "stories": stories})
        files.add(name)
    else:
        buckets = {shard["key"]: {} for shard in plan.shards}
        for script_id, beats in stories.items():
            buckets[plan.assignment[script_id]][script_id] = beats
        for shard in plan.shards:
            key = shard["key"]
            name = f"stories-{lang}-{key}.js"
            total += write_language_stories(
                directory / name, lang,
                {"version": version, "lang": lang, "shard": key, "stories": buckets[key]}, key,
            )
            files.add(name)
    return {
        "files": files,
        "stories": len(stories),
        "shards": 1 if full_text else len(plan.shards),
        "bytes": total,
        "characters": len(renderer.character_ids),
        "options": renderer.option_count,
        "lockedOptions": renderer.locked_count,
        "richText": renderer.rich_count,
        "think": renderer.think_count,
        "lore": renderer.lore_count,
        "missingKeys": renderer.missing_count,
        "missingSamples": renderer.missing[:40],
    }
