---
name: bias-review
description: Critically analyse a URL (article, post, paper, product page, or any web content) for bias, conflicts of interest, source quality, and reliability. Use this skill whenever the user shares a link and asks to "review", "check", "analyse", or "fact-check" it, or asks who wrote something, whether to trust it, whether it's biased, or how to read it critically. Also trigger when the user shares a link alongside sceptical language ("is this legit?", "seems fishy", "what do you think of this?"). Do not wait for the word "bias" — intent to evaluate credibility is enough.
---

# Bias Review Skill

Critically review a piece of web content for bias, conflicts of interest, source quality, and author reliability. The goal is to **arm the reader**, not make the call for them — a biased source can still contain true things; a clean-looking source can still mislead.

---

## Workflow

### 1. Fetch the content
Use `web_fetch` on the provided URL. Extract:
- Title, publication, date
- Byline / author name(s)
- Any funding disclosures, "about" links, or footer notes
- The body text

### 2. Research in parallel (web search)
Run these searches concurrently:
- Author name + "affiliations" or "background"
- Author name + publication name + "bias" or "criticism" or "controversy"
- Publication name + "funding" or "ownership" or "who owns"
- Author name + any brands, organisations, or topics they write about heavily

Pull enough to assess track record and financial relationships. Note if nothing surfaces — absence of a footprint is itself a signal (pseudonym? new account? thin history?).

### 3. Score each dimension

Score each on a **traffic light** scale. The colours are a *scrutiny gradient*, not a danger gradient — they tell the reader how hard to look, not whether the content is true or false:

| Signal | Meaning |
|--------|---------|
| 🟢 | Take at face value — assessed, no notable concern on this dimension |
| 🟡 | Verify before relying on it |
| 🔴 | Scrutinise heavily |
| ⚪ | Couldn't assess — genuinely no information to judge on |

A 🔴 means "look closer here," **not** "this is false" — a biased source can be accurate, a clean one wrong. The prose must name *which kind* of problem the light reflects: bias, unreliability, conflict, or thin evidence.

**⚪ (grey)** is for genuine information absence only — an obscure author with no findable footprint, a dimension the content doesn't speak to. It is not "assessed and fine" (🟢) or "vague worry" (🟡); it means there was nothing to rate, and the prose must say why. Don't let grey drain the green tier: assessed-and-clean is green.

**Rate what the content supports.** Full piece → rate every dimension. Partial content (truncated article, publisher-posted excerpt) → rate what it genuinely supports, mark the rest ⚪ with a one-line reason. Don't stretch one observation to cover a gap.

**Hard floor — no content, no review.** If you couldn't read the actual content (fetch blocked, paywalled, expired link, metadata/URL/snippet only), **do not produce a scored review** — not even all-grey. Ratings inferred from a URL or domain are guesses dressed as analysis, the exact failure this skill exists to prevent. Instead: say what blocked you, offer any genuinely factual publisher context if useful (e.g. "BBC is publicly funded"), ask for pasted text, and stop.

#### Dimensions

**1. Provenance**
- Who is the author? Individual, anonymous, or institutional byline?
- Who published it? Independent outlet, think tank, brand, platform account?
- Is there any disclosed funding, sponsorship, or "supported by"?
- Is the publishing entity editorially independent from its funders?

**2. Conflicts of Interest**
- Does the author have financial, professional, or ideological ties to the subject matter?
- Do they reference, recommend, or link to their own products/brands/employers?
- Do they have a clear stake in the reader reaching a particular conclusion?

**3. Evidential Quality**
- Are claims backed by cited sources? Are those sources primary (studies, official data) or secondary (other articles)?
- Are citations credible and checkable, or vague ("studies show", "experts say")?
- Is opinion clearly labelled as opinion, or presented in authoritative register?
- Does the piece acknowledge counter-evidence or alternative interpretations?

**4. Presentation & Framing**
- Who is the intended audience, and does that shape what's included or omitted?
- Is emotional or loaded language used to steer rather than inform?
- Are headlines/subheadings proportionate to the evidence, or sensationalised?
- Is there notable selectivity — cherry-picked data, missing context?

**5. Author Track Record**
- Does the author have a consistent publication history? On what topics?
- Have they been associated with retractions, corrections, or credibility controversies?
- Do they write across many unrelated topics quickly (content farm signal)?
- Are they cited or referenced by credible third parties?

**6. Timing & Context**
- Was this published to coincide with a news event, earnings cycle, regulatory moment, or public debate where the author or publisher has a stake?
- Does the publication timing suggest a reactive or defensive motive?
- Is there a broader campaign or pattern of similar content from this source around this topic?

---

### 4. Determining the overall verdict

The overall is **not an average** — the dimensions were never equal. They are six routes to compromising one underlying thing: **trust integrity**, whether the reader can rely on what the piece tells them. The verdict measures that; the dimensions are just where it breaks.

Two things set the weight of any 🔴:

- **How badly it breaks trust.** A flaw that means you can't take the rest at face value — a severe undisclosed conflict, fabricated or misrepresented evidence — can cap the overall alone, however clean everything else is. A flaw that dents trust without breaking it weighs less.
- **How visible it is.** Concealment is the multiplier. An obvious polemic is light: the reader can see it working and discount it. A hidden conflict or buried funding source is heavy, because they can't — surfacing that is the whole point of the skill.

So ask: what most damages the reader's ability to trust this piece, and could they have caught it without you? Bias (honest but skewed) and unreliability (simply wrong) are two ways trust breaks — name which in the prose, but both feed the one verdict. Reason from the piece; don't tally the lights.

**The overall is never ⚪** — a verdict is a call from what you *did* learn. If a dimension is grey, judge from the rest and note the gap. (If everything's grey, you're at the hard floor and shouldn't be writing a verdict.)

**Guard against your own reviewer bias.** This skill hunts for problems, so it finds them:
- **Green must be reachable.** Credit what the piece does well — disclosed conflicts, primary sources, steelmanning, opinion marked as opinion. If everything trends red, check you're not pattern-matching unfamiliarity or fame-driven search noise.
- **Mind the search asymmetry.** "Author + criticism" finds critics for almost anyone, and fame generates more searchable controversy than obscurity. Weigh whether the criticism is credible or just the sign of a contested figure. Thin footprint is a weak signal, not a damning one.
- **You have a vantage point too.** Judging "loaded language" or "proportionate to evidence" measures against a baseline of what reads as neutral — which isn't neutral. An unfamiliar position can read as "more biased" just for being unfamiliar. Flag the substance, not the unfamiliarity.

---

### 5. Output format

```
## Bias Review: [Title]
[URL] · [Author] · [Publication] · [Date if available]

---

### Overall: 🟡 [short label]
(Overall is one of 🟢 / 🟡 / 🔴 — never ⚪)

[2–3 sentence plain-English summary of the main concerns and what the reader should watch for.]

---

### Provenance 🟢 / 🟡 / 🔴 / ⚪ — [short label]
[2–4 sentences. What we know, what we don't, what that means.]

### Conflicts of Interest 🟢 / 🟡 / 🔴 / ⚪ — [short label]
[2–4 sentences.]

### Evidential Quality 🟢 / 🟡 / 🔴 / ⚪ — [short label]
[2–4 sentences.]

### Presentation & Framing 🟢 / 🟡 / 🔴 / ⚪ — [short label]
[2–4 sentences.]

### Author Track Record 🟢 / 🟡 / 🔴 / ⚪ — [short label]
[2–4 sentences. If nothing surfaced, ⚪ — thin footprint is "couldn't assess," not a black mark.]

### Timing & Context 🟢 / 🟡 / 🔴 / ⚪ — [short label]
[2–4 sentences. If nothing notable, say so briefly and move on. Don't manufacture motive where none is evident.]

---

### How to read this
[Concrete, specific guidance — not generic. E.g. "The funding claim in paragraph 3 is unsourced — worth checking independently." or "The author's conclusion goes further than the study they cite actually supports."]

---

*This review is a critical-reading aid, not a verdict on truth. The lights show where to apply scrutiny, not what's true or false. It reflects the reviewer's own baseline of what reads as neutral, which is itself a vantage point — weigh it as one input, not a ruling.*
```

---

## Notes

- **Be specific, not boilerplate.** Every section should contain detail from *this* piece, not generic advice that could apply to anything.
- **Can't fetch** (paywall, block, expired signed link, network restriction): hard floor — see §3, don't rate from metadata. Frequent offenders: BBC and some news sites (network-blocked), signed PDF links (expire fast), UTM-tagged subscriber share links.
- **Social media posts**: treat the account as the "author" and platform as the "publisher". Look up account history and following as a proxy for track record.
- **Research papers**: weight Evidential Quality heavily; check journal reputation and whether authors disclosed funding.
- **Product/brand pages**: Conflicts of Interest is almost certainly 🔴 by default — focus analysis on what claims are made and how they're supported.
- **Tone**: neutral and analytical. Don't editorialize beyond what the evidence supports. The reader decides; you equip them.
