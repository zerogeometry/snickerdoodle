"""Draw the Studio's Christmas stickers as children's doodles with local Qwen Image (ComfyUI).

Same family, same ids and meanings as before, just redrawn the way a child would: wobbly felt-tip
outlines that don't quite join, uneven strokes, lopsided shapes, flat bold colouring. Brand-safe,
synthetic art only; nothing leaves this machine (ComfyUI on 127.0.0.1).

  python scripts/stickers/doodle_generate.py [--variants N] [--edit] [id ...]   (no ids = all)

--edit restyles the current vector sticker (a 1024px render passed as <image1>) instead of drawing
from text alone. Candidates land in sticker-art/candidates/<id>_v<n>.png (git-ignored); pick one per
sticker in sticker-art/picks.json, then run doodle_trace.py. (The seeds behind the 2026 set are in
scripts/stickers/doodle-picks.json — the same seed + prompt redraws the same doodle.)
Needs ComfyUI on http://127.0.0.1:8188 (WSL: ~/comfy/start.sh). One job at a time — the GPU is shared.
"""
import copy
import json
import random
import sys
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

COMFY = "http://127.0.0.1:8188"
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "sticker-art" / "candidates"
FLOWS = Path(r"C:\Users\Simon\dev\Open-Higgsfield-AI\electron\comfyui-workflows")

STYLE = (
    "Drawn by a happy 6-year-old with chunky felt-tip pens on plain white paper. A thick dark brown-black "
    "felt-tip outline that wobbles and doesn't quite join up, uneven line thickness, lopsided imperfect "
    "shapes, flat bold colouring done with fast felt-tip strokes that sometimes go slightly over the lines, "
    "simple dot eyes and a curvy smile. Only these colours: tomato red, sunshine yellow, leaf green, sky "
    "blue, cobalt blue, warm brown, soft pink and white. One single subject in the middle with lots of "
    "empty white paper all around it. No background, no ground line, no shadow, no writing."
)
NEG = (
    "adult artist, professional illustration, vector art, clean smooth lines, perfect symmetry, kawaii "
    "sticker, die-cut white border, drop shadow, gradient, shading, 3d, photo, paper texture, lined paper, "
    "background scenery, multiple subjects, text, letters, watermark, signature, frame"
)

# id → what the child drew (same meanings as the old vector family)
SUBJECTS = {
    "gingerbread": "a gingerbread man biscuit with arms out wide, white icing squiggles on his hands and feet, "
                   "a red bow tie and two buttons, one green and one blue",
    "reindeer": "a chubby brown reindeer face and little body with big yellow antlers, a round red nose and a "
                "green and white stripy scarf",
    "snowman": "a snowman made of two white snowballs with an orange carrot nose, coal dot eyes and a red and "
               "white stripy scarf",
    "santa": "Father Christmas from the tummy up, a red hat with a white bobble, a big fluffy white beard, "
             "rosy cheeks, a red coat with a black belt and a yellow buckle",
    "mrsClaus": "Mrs Claus from the tummy up, white hair in a bun with a sprig of holly, round yellow "
                "glasses, rosy cheeks and a red dress with a white collar",
    "penguin": "a round cobalt blue penguin with a white tummy, a yellow beak and feet, rosy cheeks, wearing a "
               "red and white stripy bobble hat",
    "star": "a fat smiling yellow five-pointed Christmas star wearing a green and white stripy bobble hat",
    "holly": "a sprig of holly: two spiky green holly leaves and three round red berries, the middle berry "
             "has a smiley face",
    "candyCane": "a candy cane with chunky red and white stripes and a little green bow",
    "tinsel": "a droopy swag of sparkly yellow tinsel garland with a red bow at each end and three round "
              "baubles hanging from it, red, blue and green, the blue one in the middle smiles",
    "sack": "a plump cream-coloured Christmas sack tied with a red bow, presents peeping out of the top, a "
            "small yellow star on the side and a smiley face",
    "present": "a red Christmas present box with a yellow ribbon and a big yellow bow on top and a happy "
               "smiley face on the front",
}


def submit(wf):
    body = json.dumps({"prompt": wf, "client_id": str(uuid.uuid4())}).encode()
    req = urllib.request.Request(f"{COMFY}/prompt", data=body, headers={"Content-Type": "application/json"})
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


def upload(path):
    """Multipart upload of a reference image to ComfyUI's input folder; returns its LoadImage name."""
    boundary = uuid.uuid4().hex
    data = path.read_bytes()
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{path.name}\"\r\n"
            f"Content-Type: image/png\r\n\r\n").encode() + data + (
            f"\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"overwrite\"\r\n\r\ntrue\r\n"
            f"--{boundary}--\r\n").encode()
    req = urllib.request.Request(f"{COMFY}/upload/image", data=body,
                                 headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    info = json.load(urllib.request.urlopen(req))
    return f"{info['subfolder']}/{info['name']}" if info.get("subfolder") else info["name"]


def t2i(subject, seed):
    wf = json.loads((FLOWS / "qwen_image_t2i.json").read_text())
    wf["459:452"]["inputs"]["prompt"] = f"A child's felt-tip doodle of {subject}. {STYLE}"
    wf["459:452"]["inputs"]["negative_prompt"] = NEG
    wf["459:456"]["inputs"]["width"] = 1024
    wf["459:456"]["inputs"]["height"] = 1024
    wf["459:458"]["inputs"]["seed"] = seed
    wf["461"]["inputs"]["filename_prefix"] = "snickerdoodle-stickers/t2i"
    return wf


def edit(subject, ref_name, seed):
    wf = json.loads((FLOWS / "qwen_image_edit.json").read_text())
    enc = wf["459:474"]["inputs"]
    enc["prompt"] = (f"Redraw <image1> ({subject}) as if a 6-year-old child copied it with felt-tip pens: keep "
                     f"the same character, pose, colours and accessories, but make every line wobbly and "
                     f"hand-drawn. {STYLE}")
    enc["negative_prompt"] = NEG
    enc["resolution"] = 0
    wf["ref1"] = {"inputs": {"image": ref_name}, "class_type": "LoadImage", "_meta": {"title": "Reference 1"}}
    enc["images.image_1"] = ["ref1", 0]
    wf["459:458"]["inputs"]["seed"] = seed
    wf["461"]["inputs"]["filename_prefix"] = "snickerdoodle-stickers/edit"
    return wf


def main():
    args = sys.argv[1:]
    variants, mode = 1, "t2i"
    while args and args[0].startswith("--"):
        if args[0] == "--variants":
            variants, args = int(args[1]), args[2:]
        elif args[0] == "--edit":
            mode, args = "edit", args[1:]
        else:
            raise SystemExit(f"unknown flag {args[0]}")
    wanted = args or list(SUBJECTS)
    OUT.mkdir(parents=True, exist_ok=True)
    mf = OUT / "manifest.json"
    manifest = json.loads(mf.read_text()) if mf.exists() else {}
    for sid in wanted:
        subject = SUBJECTS[sid]
        ref = None
        if mode == "edit":
            ref = upload(ROOT / "sticker-art" / "old" / f"{sid}.png")
        for _ in range(variants):
            n = 1 + max([int(p.stem.rsplit("_v", 1)[1]) for p in OUT.glob(f"{sid}_v*.png")] or [0])
            seed = random.randint(1, 2**31)
            wf = edit(subject, ref, seed) if mode == "edit" else t2i(subject, seed)
            t0 = time.time()
            img = wait(submit(wf))
            dest = OUT / f"{sid}_v{n}.png"
            fetch(img, dest)
            print(f"{dest.name}  {mode}  seed={seed}  {time.time() - t0:.0f}s", flush=True)
            manifest[dest.name] = {"id": sid, "mode": mode, "seed": seed}
            mf.write_text(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
