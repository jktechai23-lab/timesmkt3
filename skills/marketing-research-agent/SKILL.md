---
name: marketing-research-agent
description: >
  Conducts structured marketing intelligence research for a given business niche or topic using
  the local Tavily AI SDK. Use when the user asks to "research a market", "analyze competitors",
  "generate campaign insights", "find marketing angles", "research content ideas", "run market
  research", or "build a research brief". Outputs machine-readable structured JSON, a Markdown report with 
  mermaid graphs, and an interactive HTML report with Chart.js and brand styling. These outputs are 
  ready for downstream agents (video, image ads, copywriter) to consume directly. Always use this skill 
  when the pipeline needs a strategic research layer before generating creative assets.
---

# Marketing Research Agent

Conducts Tavily-powered market research for a business niche and outputs structured marketing intelligence across JSON, Markdown, and Interactive HTML formats for downstream creative agents and stakeholders.

## When to Use This Skill

- User provides a business niche, product category, or topic to research
- User asks for campaign insights, content ideas, competitor analysis, or marketing angles
- User says "run market research", "analyze the market", "find ad hooks", "generate research brief"
- A downstream agent (video, image ad, copywriter) needs a strategic foundation before generating assets
- User says "start the pipeline" or "kick off the campaign" — research is always the first step
- **FORCE TRIGGER**: Any request involving market research, competitor analysis, or marketing intelligence MUST automatically trigger this skill.
- **CRITICAL RESTRICTION**: **DO NOT use the built-in web search tool.** You must use the local Tavily AI JavaScript SDK (`@tavily/core`) through a custom Node script.

---

## CRITICAL: Output Artifacts and Folder Structure

The final output of this skill is a set of files generated in a **newly created folder** under the `<project_dir>/outputs/` directory. For example, if researching "Cold Brew 2025", create the directory `<project_dir>/outputs/market_research_2025/`.

Inside this isolated folder, you must output three deliverables:
1. `research_results.json` (Structured JSON)
2. `research_brief.md` (Markdown Brief with Mermaid graphs)
3. `interactive_report.html` (Interactive HTML with Chart.js, brand colors, and stylized scrollbar)

---

## Step 1: Gather Inputs

Collect the following before starting research:

| Input | Example |
|---|---|
| Business niche or topic | "cold brew coffee", "sustainable skincare", "B2B SaaS" |
| Target audience (optional) | "millennials", "fitness enthusiasts", "small business owners" |
| Campaign goal (optional) | "brand awareness", "product launch", "conversions" |

If niche or topic is not provided, ask the user before proceeding.

---

## Step 2: Run Tavily Research via Node.js SDK

**DO NOT** use the IDE's built-in web search tool. Instead, follow these exact steps to pull data programmatically:

1. Create a local Node script inside the campaign output directory: `<output_dir>/tavily-search.js`. **Never create this script in the project root.**
2. The script must require `@tavily/core`.
3. To get the API key, manually read and parse the `.env` file instead of using the `dotenv` package.
   Example: 
   ```javascript
   const fs = require('fs');
   const envData = fs.readFileSync('.env', 'utf-8');
   const key = envData.match(/TAVILY_API_KEY=(.*)/)[1].trim();
   ```
4. Execute the following 5 queries via the SDK with `{ searchDepth: "advanced" }`:
   - `[niche] market trends 2024 2025`
   - `[niche] competitor marketing strategies`
   - `[niche] audience pain points and desires`
   - `[niche] best performing ad hooks and angles`
   - `[niche] viral content topics social media`
5. Map over the results to retain only titles and content snippets to save space, and save them to `<output_dir>/tavily_results.json`. **Never write this file to the project root.**
6. Run the script via the terminal. Wait for the background command to finish and read the JSON results using `view_file`.

---

## Step 3: Synthesize Research

After reading the raw results, act as an expert marketer to synthesize the findings into the following categories:

- **Industry Trends** — High-level market shifts, growth forecasts, and projections.
- **Consumer Motivations** — Pain points, emotional triggers, and desires.
- **Competitor Messaging** — Value propositions and messaging frames rivals are employing.
- **Content Topics** — Viral and recurring subjects for organic content creation.
- **Marketing Angles** — 3 to 4 core narrative gaps or positioning statements.
- **Keywords** — High-signal words and phrases.
- **Video Concepts** — Specific short-form video plans (title, hook, format, platform, duration).
- **Ad Hooks** — Scroll-stopping opening lines.

### CRITICAL: Consumer Voice Layer

The fields above are the analytical layer (intended for the marketing decision-maker). Downstream agents (gatilhos worker, report worker, video templates) need a parallel **consumer-facing layer** so the final ads/videos speak directly to the end customer of the campaign — not to the marketer who commissioned it.

For **EVERY** entry in `consumer_motivations` and `industry_trends`, you MUST also add these fields:

- `consumer_voice` — short headline (≤ 60 chars) in **2nd person, present tense**, addressing the consumer directly. NEVER use marketing jargon ("custo-benefício", "jornada híbrida", "consumidores escolhem...", "64% dos clientes"). Always use "você", emotional framing, and language a real human would say out loud.
- `consumer_voice_subhead` — supporting line (≤ 110 chars) that elaborates without breaking the 2nd-person voice. Translate any data point into "what this means for you", not "what the market shows".

#### Examples — bad vs good

| Field type | ❌ Marketer voice | ✅ Consumer voice |
|---|---|---|
| pain_point | "Custo-benefício e planejamento" | "Você quer dar algo que dure, mas sem estourar o orçamento" |
| emotional_trigger | "64% dos consumidores escolhem por preço" | "Esse ano você quer mostrar valor, não só preço" |
| trend | "Jornada híbrida de consumo" | "Você pesquisa online, mas ainda quer sentir antes de comprar" |
| trend detail | "Crescimento de 23% no segmento" | "Mais gente como você está fazendo essa escolha" |

The `consumer_voice` field MUST be aligned with the campaign's target persona (filho que homenageia mãe, pai de primeira viagem, gestor de PME, etc — extract from `target_audience` if provided, or infer from the niche).

---

## Step 4: Generate Output Deliverables

Create a new directory in `<project_dir>/outputs/` named after the research topic. Place the following three files inside it:

### 1. Structured JSON (`research_results.json`)
Output the pure synthesized data in strict, valid JSON format. All arrays must contain at least 3 items, and `video_concepts` must contain at least 2 objects.

**Required schema for `consumer_motivations[]` entries:**
```json
{
  "pain_point": "<analytical label, e.g. 'Custo-benefício e planejamento'>",
  "description": "<analytical description>",
  "emotional_trigger": "<analytical trigger>",
  "consumer_voice": "<2nd person headline, ≤ 60 chars>",
  "consumer_voice_subhead": "<2nd person body, ≤ 110 chars>"
}
```

**Required schema for `industry_trends[]` entries:**
```json
{
  "trend": "<analytical label, e.g. 'Jornada híbrida de consumo'>",
  "detail": "<analytical detail>",
  "consumer_voice": "<2nd person headline, ≤ 60 chars>",
  "consumer_voice_subhead": "<2nd person body, ≤ 110 chars>"
}
```

The consumer_voice fields are NOT optional — downstream workers depend on them.

### 2. Markdown Brief (`research_brief.md`)
Create a human-readable markdown brief summarizing the findings.
Include at least two `mermaid` diagrams (e.g., an `xychart-beta` for market value projections, and a `pie` chart for product segmentation). Ensure the formatting makes it highly scannable for stakeholders.

### 3. Interactive HTML Report (`interactive_report.html`)
Design an interactive, visually stunning HTML report serving as a strategic insight dashboard.
**Crucial Styling Requirements:**
- Must consult `<project_dir>/knowledge/brand_identity.md` and `<project_dir>/knowledge/product_campaign.md` (or the equivalent brand docs) to find **the EXACT brand color palette** and implement them via CSS `--variables`.
- Implement **Premium UI/UX:** Use dark mode backgrounds, glassmorphism cards (using `backdrop-filter: blur()`), and ambient radiant gradient backgrounds.
- **Stylized Custom Scrollbar:** You must implement a custom webkit scrollbar using the brand colors. Do not omit this. 
  Example using generic variable references:
  ```css
  ::-webkit-scrollbar { width: 12px; }
  ::-webkit-scrollbar-track { background: var(--bg-color); }
  ::-webkit-scrollbar-thumb {
      background: var(--card-bg);
      border-radius: 6px;
      border: 2px solid var(--bg-color);
  }
  ::-webkit-scrollbar-thumb:hover { background: var(--primary-accent); }
  ```
- Make sure to implement BOTH `-webkit-background-clip: text;` and the standard `background-clip: text;` on gradients to avoid CSS lint warnings.
- Integrate **Chart.js via CDN** to render interactive canvas visual graphs reflecting the same numbers generated in your Markdown/JSON items. The charts must be colored using the `brand palette` accent colors.

---

## Step 5: Handoff Summary

After all output files and logs exist in their dedicated folder, provide a succinct plain-language summary in the chat covering:

- The biggest market opportunity identified
- The strongest 1–2 ad hooks and why they connect with the audience pain points
- Confirmation that the three output deliverables are safely stored in their new `<project_dir>/outputs/` folder
- Recommendation on which downstream agent should run next (Video Ad Agent or Image Ad Agent)

---

## Quality Checklist

Before finalizing output, verify:
- [ ] No IDE Web Search used; SDK Node.js script ran locally and read the `.env` manually.
- [ ] A new subfolder was created inside `<project_dir>/outputs/`.
- [ ] JSON is valid machine-readable data.
- [ ] **Every `consumer_motivations[]` entry has `consumer_voice` AND `consumer_voice_subhead` fields in 2nd person, no marketing jargon.**
- [ ] **Every `industry_trends[]` entry has `consumer_voice` AND `consumer_voice_subhead` fields in 2nd person, translating data into consumer impact.**
- [ ] consumer_voice fields are aligned with the campaign's target persona (not generic).
- [ ] Interactive HTML features a custom styled scrollbar using the brand palette.
- [ ] Interactive HTML features animated Chart.js graphs mapping the findings.
- [ ] Markdown brief includes mermaid diagrams.
