"""Generate sheets of kids'-style line doodles for the homepage section textures (local Qwen Image, ComfyUI).

Brand-safe, synthetic line art only — never a real child's drawing. The sheets are raw material:
scripts/textures/build.py cuts the doodles out and lays them on a seamless tile in the brand colours.

Usage:  python scripts/textures/generate.py [--variants N] [christmas|everyday ...]   (no theme = both)
Writes to .texture-work/sheets/<theme>_v<n>.png (git-ignored working folder).
Needs ComfyUI on http://127.0.0.1:8188 (WSL: ~/comfy/start.sh).
"""
import copy
import json
import random
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

COMFY = "http://127.0.0.1:8188"
ROOT = Path(__file__).resolve().parent.parent.parent
OUT = ROOT / ".texture-work" / "sheets"
WORKFLOW = Path(r"C:\Users\Simon\dev\Open-Higgsfield-AI\electron\comfyui-workflows\qwen_image_t2i.json")

STYLE = (
    "A sheet of plain white printer paper covered with lots of small separate doodles, each one on its own with "
    "plenty of empty white space around it, nothing touching or overlapping. Every doodle was drawn by a real "
    "4-year-old child with one chunky black marker pen: outline only, no colouring in, no shading. Crude, naive "
    "and simple like a nursery drawing, not an adult's sketch: very wobbly shaky lines, lumpy lopsided shapes, "
    "lines that overshoot or don't quite join up, uneven pressure so some strokes are much thicker than others, "
    "odd proportions, the fewest possible lines, simple dot eyes and big smiles. Charming and imperfect. "
    "Scanned flat, pure white background, black ink only, even lighting, no shadows, no text, no writing."
)
NEG = (
    "adult artist, professional illustration, clean vector, perfect lines, smooth curves, symmetry, colour, "
    "colouring in, filled shapes, shading, grey tones, gradient, texture, paper grain, shadows, photo, 3d, "
    "text, letters, words, numbers, signature, watermark, border, frame, overlapping doodles, pattern, mandala"
)
SUBJECTS = {
    "christmas": [
        "a christmas tree with a star on top, a bauble, a snowman with a carrot nose, a snowflake, a santa hat, "
        "a present with a bow, a stocking, a candy cane, a gingerbread man, a robin, a holly leaf with berries, "
        "a reindeer face with antlers, a bell, a star, a mitten, a pudding",
        "a sleigh, a wonky star, a cracker, a paper crown, a candle, a penguin in a scarf, a bobble hat, a "
        "wreath, a jumper, a present, an angel, a moon, a snowflake, a christmas tree, a carrot, a mince pie",
        "a reindeer, a snowman, three baubles, a gingerbread house, a holly sprig, a polar bear, a stocking, a "
        "bell with a bow, a little elf hat, a star, a christmas pudding, a candy cane, a snowflake, a present",
    ],
    "everyday": [
        "a sun with rays, a house with a chimney, a cat, a dog, a flower in a pot, a rainbow, a cloud, a heart, "
        "a fish, a snail, a balloon, a star, a crayon, a pencil, a butterfly, a tree",
        "a dinosaur, a rocket, a giraffe, a paintbrush, a paint palette, a smiley cookie, a cow, a car, a bird, "
        "a flower, a moon, a boat, an apple, a crayon, a spiral, a cloud",
        "a stick-figure family holding hands, a teddy bear, a kite, a sun, a house, a tree, a ladybird, a "
        "whale, a snail, a heart, a birthday cake with candles, a duck, a star, a flower, a pencil, a rainbow",
    ],
}


def submit(wf):
    req = urllib.request.Request(f"{COMFY}/prompt", data=json.dumps({"prompt": wf}).encode(),
                                 headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req))["prompt_id"]


def wait(pid, timeout=900):
    t0 = time.time()
    while time.time() - t0 < timeout:
        h = json.load(urllib.request.urlopen(f"{COMFY}/history/{pid}"))
        if pid in h:
            st = h[pid].get("status", {})
            if st.get("status_str") == "error":
                raise RuntimeError(json.dumps(st)[:2000])
            for node in h[pid]["outputs"].values():
                for img in node.get("images", []):
                    return img
        time.sleep(2)
    raise TimeoutError(pid)


def fetch(img, dest):
    q = urllib.parse.urlencode({"filename": img["filename"], "subfolder": img["subfolder"], "type": img["type"]})
    dest.write_bytes(urllib.request.urlopen(f"{COMFY}/view?{q}").read())


def main():
    args = sys.argv[1:]
    variants = 1
    if args[:1] == ["--variants"]:
        variants, args = int(args[1]), args[2:]
    themes = args or list(SUBJECTS)
    base = json.loads(WORKFLOW.read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    for theme in themes:
        for subjects in SUBJECTS[theme]:
            for _ in range(variants):
                n = 1 + max([int(p.stem.split("_v")[1]) for p in OUT.glob(f"{theme}_v*.png")] or [0])
                wf = copy.deepcopy(base)
                wf["459:452"]["inputs"]["prompt"] = f"Doodles of: {subjects}. {STYLE}"
                wf["459:452"]["inputs"]["negative_prompt"] = NEG
                wf["459:456"]["inputs"]["width"] = 1328
                wf["459:456"]["inputs"]["height"] = 1328
                seed = random.randint(1, 2**31)
                wf["459:458"]["inputs"]["seed"] = seed
                wf["461"]["inputs"]["filename_prefix"] = f"snickerdoodle-textures/{theme}"
                t0 = time.time()
                img = wait(submit(wf))
                dest = OUT / f"{theme}_v{n}.png"
                fetch(img, dest)
                print(f"{dest.name}  seed={seed}  {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
