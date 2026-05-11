# prj/ — projetos de marca/campanha

Esta pasta contém os **projetos** que o pipeline opera. Cada subdiretório aqui é uma marca/cliente independente.

`prj/` inteiro está no `.gitignore` (apenas este README persiste no repo) — os assets, knowledge, e outputs ficam só no host onde o sistema roda.

## Estrutura mínima de um projeto

```
prj/<slug>/
├── knowledge/
│   ├── brand_identity.md       ← tom, emojis, CTA, hashtags
│   ├── product_campaign.md     ← features, assets, ângulos
│   └── platform_guidelines.md  ← regras por plataforma
├── assets/
│   ├── music/                  ← .mp3 de trilha (opcional)
│   └── (qualquer imagem da marca)
└── outputs/                    ← gerado pelo pipeline
    └── <task_name>_<date>/
        ├── ads/
        ├── imgs/
        ├── video/
        ├── viral/
        ├── audio/
        └── ...
```

## Como começar do zero

1. Decida o slug do projeto (ex: `minha-marca`, `coldbrew-coffee-co`).

2. Crie a estrutura:
   ```bash
   mkdir -p prj/minha-marca/{knowledge,assets/music}
   ```

3. Preencha os 3 MDs em `knowledge/`. Sem eles, os agentes não têm contexto da marca:

   - **brand_identity.md** — voz, tom, palette, emojis preferidos, hashtags fixas, CTA padrão, URL da marca
   - **product_campaign.md** — produto/serviço, público, dores, benefícios, ângulos de campanha
   - **platform_guidelines.md** — regras por canal (IG carrossel, TikTok hook, YouTube CTA, etc)

4. (Opcional) Coloque um .mp3 em `assets/music/` pra video pro/viral usar como trilha.

5. Rode uma campanha apontando pra esse slug:
   ```bash
   docker compose exec worker npm run pipeline:run:payload '{"project_dir":"prj/minha-marca","task_name":"primeira_campanha","task_date":"2026-05-10","language":"pt-BR"}'
   ```

   Ou via Telegram (recomendado): `/loterun <comando>`.

## Demo bundled

`prj/inema/knowledge/` vem **no repo** como demo template — INEMA.CLUB (educação grátis em IA pra mães empreendedoras). Os 3 MDs (brand_identity, product_campaign, platform_guidelines) servem como referência de formato e profundidade.

Use eles como base pra criar seu projeto:

```bash
./setup new minha-marca   # copia os 3 MDs do INEMA pra prj/minha-marca/knowledge/
```

Depois edite os MDs em `prj/minha-marca/knowledge/` pra refletir a sua marca/produto.

## Padrões

- Slug sem espaços, lowercase, hifens: `cliente-x` ✓, `Cliente X` ✗
- `task_name` é dentro do projeto: cada campanha vira uma pasta em `outputs/`
- Cada output dir tem `imgs/`, `ads/`, `video/` etc — gerados pelos agentes
- `.gitignore` exclui outputs/ e logs/ — versionar só conteúdo manual em `knowledge/` e `assets/`
