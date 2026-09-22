# 🎨 Cartoon Melchior — image generation guide

The site ships with a hand-drawn **SVG Melchior** (`public/index.html`), so it works out of the box.
Use this guide to generate nicer custom artwork with an image AI, then drop the files in `public/img/`.
The site picks them up automatically, with no code changes.

Reference photo: [`docs/reference/melchior-photo.webp`](reference/melchior-photo.webp)

---

## 1. Character sheet (paste this into every prompt)

> **Melchior**: a friendly young Dutch tech guy in his early twenties. Short **copper-ginger / strawberry-blond hair**,
> styled in a messy **quiff swept up and to one side**. **Rectangular black thick-framed glasses**. Light, fair skin with a
> subtle rosy flush on the cheeks and a hint of light ginger stubble. **Big warm toothy grin**, friendly eyes, slightly
> narrow oval face with a defined chin. Wears a plain **black crew-neck sweater**. Nerdy, kind, and a little smug.

## 2. Style block (keep it identical for every pose)

> Flat 2D vector cartoon mascot, bold clean **thick dark outlines (#10201c)**, simple cel shading with one shadow tone,
> slightly oversized head (about 1:1.3 head-to-body ratio, "chibi-lite"), playful mobile-game / sticker style,
> saturated colours. Accent palette: **Ludero green #09614e**, **gold #e3cd57**, **blue #005c8a**.
> Bust shot (head and shoulders), centred, facing the viewer. **Transparent background**, no text, no watermark,
> no drop shadow on the background. Square 1024×1024.

## 3. Negative prompt (for tools that support it)

```
photorealistic, 3d render, realistic skin texture, blurry, extra fingers, deformed hands, text, letters, watermark,
logo, busy background, gradient background, multiple people, cropped head, dark lighting, horror, uncanny
```

---

## 4. Poses the site uses

Save the results under these exact names in `public/img/` (`.png`, `.webp` or `.svg`):

| File | When it shows | Prompt addition |
|------|---------------|-----------------|
| `melchior-idle.png` | Default | *Smiling warmly at the viewer, relaxed, head tilted slightly, one eyebrow a tiny bit raised as if saying "yes?".* |
| `melchior-happy.png` | Someone just paid 10¢ | *Ecstatic, mouth wide open laughing, **eyes replaced by shiny gold euro signs (€)** like a cartoon jackpot, a few small gold coins flying around his head, sparkles.* |
| `melchior-poke.png` | Someone pokes his head | *Startled and squinting, eyes squeezed shut into ">  <" shapes, wobbly mouth, small "boing" motion lines around his head, glasses slightly askew.* |

Only `melchior-idle` is required to switch to custom art. Missing poses fall back to the idle image.

### Bonus poses (for socials, Slack emoji, stickers)

- **Thinking:** *hand on chin, eyes looking up, a small glowing question mark above his head.*
- **Level up:** *both fists in the air, holding a golden trophy shaped like a coin with "10" on it, confetti in green/gold/blue.*
- **Coffee break:** *holding a steaming green mug with a gold coin logo, sleepy half-closed eyes, content smile.*
- **Debugging:** *leaning toward a laptop, glasses glinting, determined look, tiny cartoon bug fleeing.*
- **Slack emoji (128×128):** *just the head, extreme close-up, very bold outline, huge grin, readable at tiny size.*

---

## 5. Ready-to-paste prompts

### ChatGPT / GPT-image, Gemini, or any chat-based generator
Upload the reference photo, then:

```
Using the attached photo as the likeness reference, draw this person as a cartoon mascot.

Character: a friendly young Dutch tech guy. Short copper-ginger hair in a messy quiff swept up and to one side,
rectangular black thick-framed glasses, fair skin with rosy cheeks and light ginger stubble, big warm toothy grin,
plain black crew-neck sweater.

Style: flat 2D vector cartoon mascot, thick clean dark outlines, simple cel shading, slightly oversized head,
playful mobile-game sticker style, saturated colours with accents of green #09614e, gold #e3cd57 and blue #005c8a.
Head-and-shoulders bust, centred, facing the viewer. Transparent background. No text.

Pose: ecstatic, mouth wide open laughing, eyes replaced by shiny gold euro signs, small gold coins flying around his head.
```

Then ask in the same chat for the other poses: *"Same character, same style, same framing. Now: <pose>"*.
Keeping one conversation gives the most consistent character.

### Midjourney (v6+)

```
cartoon mascot bust of a friendly young tech guy, short copper-ginger quiff swept up, rectangular black thick glasses,
fair skin, rosy cheeks, big toothy grin, black crew-neck sweater, flat 2D vector style, thick dark outlines,
cel shading, mobile game sticker, accents of emerald green and gold, plain white background
--cref <URL-of-reference-photo> --cw 60 --sref <URL-of-your-first-good-result> --ar 1:1 --style raw --no text
```

- `--cref` keeps the likeness. Lower `--cw` (≈40–60) lets the cartoon style win over photo details.
- After your first good result, use it as `--sref` for every other pose so the style stays locked.
- Midjourney doesn't do transparency. Remove the background afterwards (see below).

### Stable Diffusion / SDXL / Flux (local or ComfyUI)

- Positive: *character sheet + style block + pose*
- Negative: *the negative prompt above*
- Use **IP-Adapter FaceID** or **InstantID** with the reference photo (weight ≈ 0.5–0.7) for likeness.
- A "flat vector / sticker" LoRA helps a lot. CFG 5–7, 30 steps, 1024×1024.

---

## 6. Post-processing checklist

1. **Remove the background** (remove.bg, Photoshop "Remove background", or `rembg` locally) and export a transparent PNG/WebP.
2. **Crop consistently**: the head should sit in the top ~70% with the shoulders touching the bottom edge, the same in every pose, so the swap doesn't jump.
3. Export at **800×900 px** (the SVG's aspect ratio is 320:360) or square 1024×1024. Both work (`object-fit: contain`).
4. Keep files **under ~300 KB** (WebP quality 85 is plenty).
5. Copy them to `public/img/`, then refresh the page. With Docker, rebuild, or mount the folder (see the README).

> 💡 Tip: generate 4–8 candidates per pose and pick the ones where the glasses and hair look most alike.
> Consistency matters more than the quality of any single image.
