"""Copy the analytics state block and Rule 1 into both CLAUDE.md files.

state_block.md in this folder is the source. The worktree's CLAUDE.md is the
committed copy; the main checkout's CLAUDE.md is what a new chat opened there
loads first.
"""

import os
import sys

WORK = os.path.dirname(os.path.abspath(__file__))
TARGETS = [
    r"D:\Coding\Flolabs\crm\.claude\worktrees\analytics_tool\CLAUDE.md",
    r"D:\Coding\Flolabs\crm\CLAUDE.md",
]
START = "<!-- analytics-state:start -->"
END = "<!-- analytics-state:end -->"
RULE_HEADING = "## Rule #1: do not touch existing CRM logic"
RULE = (
    f"{RULE_HEADING}\n\n"
    "The analytics tool is added to the existing CRM as new modules in the existing server and "
    "front end, with no separate server. Do not change existing CRM logic or break anything. "
    "New code goes in new files. Every change to core CRM code needs one agent to write it and a "
    'second agent to review it. Do not fix, refactor or "improve" anything the user did not ask '
    "for. Full project state: see **CRM Analytics tool: project state** at the end of this file.\n\n"
)
ANCHOR = "## House rules"


def read(path):
    with open(path, encoding="utf8", newline="") as handle:
        return handle.read()


def write(path, text):
    with open(path, "w", encoding="utf8", newline="") as handle:
        handle.write(text)


def replace_rule(text):
    start = text.find(RULE_HEADING)
    if start != -1:
        end = text.find(ANCHOR, start)
        if end == -1:
            sys.exit(f"Could not find {ANCHOR!r} after the rule")
        return text[:start] + RULE + text[end:]
    anchor = text.find(ANCHOR)
    if anchor == -1:
        sys.exit(f"Could not find {ANCHOR!r}")
    return text[:anchor] + RULE + text[anchor:]


def replace_block(text, block):
    wrapped = f"{START}\n{block.rstrip()}\n{END}\n"
    start = text.find(START)
    if start != -1:
        end = text.find(END, start)
        if end == -1:
            sys.exit("Found the start marker without an end marker")
        return text[:start] + wrapped + text[end + len(END):].lstrip("\n")
    return text.rstrip("\n") + "\n\n" + wrapped


def main():
    block = read(os.path.join(WORK, "state_block.md")).replace("\r\n", "\n")
    for target in TARGETS:
        before = read(target)
        after = replace_block(replace_rule(before), block)
        write(target, after)
        print(f"{target}: {len(before)} -> {len(after)} chars")
    # A new chat may open in the main checkout, so it gets a copy of the resume point too.
    write(r"D:\Coding\Flolabs\crm\RESUME.md", read(r"D:\Coding\Flolabs\crm\.claude\worktrees\analytics_tool\RESUME.md"))


if __name__ == "__main__":
    main()
