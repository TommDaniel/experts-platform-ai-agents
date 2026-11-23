---
title: Redesign da UI — design system (shadcn/ui), app shell e páginas
status: draft
created: 2026-08-12
---

# Redesign da UI — design system (shadcn/ui), app shell e páginas

> Redesenha todas as páginas existentes do `apps/app` para um padrão profissional, elegante e moderno, fundando o design system em **shadcn/ui** (conforme `DESIGN_SYSTEM.md`), criando um **app shell** com sidebar para a área autenticada e documentando a evolução com capturas **antes/depois** via Playwright em `.screenshots/`.

## Contexto

As páginas atuais (`sign-in`, `sign-up`, `forgot-password`, `reset-password`, `confirm-account`, `home`, `not-found`) são funcionais, mas visualmente simples e amadoras: card centralizado com campos padrão do Tailwind, sem tipografia dedicada, sem profundidade, sem identidade visual. A stack de UI existe (`React + Vite + TailwindCSS v4`, `lucide-react`, `@repo/ui`) mas o `@repo/ui` não é consumido pelas páginas e a base em **shadcn/ui** prevista no `DESIGN_SYSTEM.md` continua apenas `[planejada]`.

O `AGENTS.md` exige, para qualquer trabalho de UI, o uso das skills `frontend-design` (obrigatória) e `web-design-guidelines` (obrigatória para revisão), e o usuário pediu explicitamente evidência visual da evolução com screenshots antes/depois. Este redesign resolve a dívida visual, cumpre o design system planejado e estabelece a fundação para as próximas features de produto (experts e conectores, ver `BUSINESS.md`).

## Objetivo

- Elevar todas as páginas existentes a um padrão **profissional, elegante, moderno, fácil de usar e acessível**, mantendo a paleta pastel e o tema claro de `DESIGN.md`.
- Fundar a base de componentes em **shadcn/ui** dentro de `packages/ui` (`@repo/ui`) e refatorar as páginas para consumi-la — eliminando as classes de campo/botão duplicadas.
- Entregar um **app shell** (sidebar + header) para a área autenticada (`/app`), pronto para receber as features futuras.
- Gerar capturas **antes/depois** de 7 telas em `.screenshots/`, com nomes `<pagina>-before.png` e `<pagina>-after.png`.

## Escopo

- **Dentro:**
  - Inicializar **shadcn/ui** em `packages/ui` (`components.json`, tokens semânticos de cor derivados da paleta, geração de componentes via CLI) e criar os componentes usados: `button`, `input`, `label`, `card`, `alert`, `badge`, `separator`, `skeleton` (e outros que o `frontend-design` julgar necessários).
  - Definir a **design language**: tipografia (Google Fonts — display e texto), escala de raios, sombras/depth, gradientes suaves, micro-interações (hover/focus/transition) e uso consistente de ícones `lucide-react`, tudo dentro da paleta pastel e tema claro.
  - Criar tokens semânticos no `apps/app/src/index.css` (Tailwind v4 `@theme`) mapeando a paleta para papéis shadcn (`background`, `foreground`, `primary`, `muted`, `destructive`, etc.).
  - Redesenhar o `AuthShell` e as 5 páginas de auth — `sign-in`, `sign-up`, `forgot-password`, `reset-password`, `confirm-account` — incluindo os estados já existentes (loading, erro, sucesso, token ausente/inválido/expirado).
  - Criar o **app shell** com sidebar (`Home`, `Experts`, `Connectors` — placeholders) e header (nome do usuário + `Sign out`), e refazer a `HomePage`.
  - Refazer `NotFoundPage` e `LoadingScreen` (skeleton).
  - Preservar lógica, contratos de API, validações, fluxos e textos en-us (ver `DEVELOPMENT.md`).
  - Capturar com Playwright: **7 telas × antes/depois** em `.screenshots/`.
  - Atualizar testes (unitários e E2E) que quebrem por seletores/estrutura.
  - Criar ADR e passos manuais de QA (workflow de `RULES.md`).

- **Fora:**
  - Alterações no back-end (`apps/api`), contratos de API ou banco.
  - Novas features de produto (experts/conectores reais, dashboards com dados).
  - Modo escuro (`DESIGN.md` fixa tema claro).
  - Alteração da paleta de `DESIGN.md` ou dos fluxos de autenticação.
  - Internacionalização (i18n).

- **Adiado:**
  - Migração de componentes para outras libs além de shadcn.
  - Storybook/documentação visual.
  - Testes visuais automatizados contínuos (regression screenshots) — nesta spec as capturas são evidência manual.

## Necessidade de negócio

O produto é uma plataforma de gestão de agentes de IA (`BUSINESS.md`). A UI é a primeira impressão e o principal diferencial percebido: uma interface amadora reduz confiança, adesão e percepção de qualidade — o que pesa ainda mais num produto de IA voltado a executivos. Este redesign profissionaliza a experiência de onboarding/auth (porta de entrada) e a área autenticada, e o design system shadcn acelera a entrega das próximas features. As capturas antes/depois servem de evidência de evolução e facilitam a aprovação do cliente.

## Critérios de aceite

- [ ] `packages/ui` tem shadcn/ui inicializado (`components.json`) e componentes gerados (`button`, `input`, `label`, `card`, `alert`, `skeleton` etc.), exportados por `@repo/ui` e consumidos pelas páginas.
- [ ] Nenhuma página de auth mantém a classe inline duplicada de input/botão: todos os campos e ações usam componentes de `@repo/ui`.
- [ ] Tipografia nova aplicada globalmente no `index.css` (Google Fonts, display + texto) com hierarquia tipográfica consistente e fallback para fontes do sistema.
- [ ] As 7 telas seguem a mesma design language (mesmos tokens, raios, sombras, botões, densidade) — consistência verificável visualmente.
- [ ] `AuthShell` redesenhado (dupla coluna assimétrica ou layout com elemento decorativo/identidade à esquerda) em todas as 5 páginas de auth, mantendo os estados atuais (erro, sucesso, loading, token ausente/inválido/expirado).
- [ ] `/app` exibe app shell: sidebar com `Home`, `Experts` e `Connectors` (placeholders), header com nome do usuário e `Sign out` funcional.
- [ ] `NotFoundPage` e `LoadingScreen` redesenhadas no mesmo padrão.
- [ ] Acessibilidade mantida e revisada com `web-design-guidelines`: `label` em todos os campos, `aria-invalid`/`aria-describedby` em erros, skip link, foco visível (`focus-visible`) e alvos de toque adequados.
- [ ] Responsivo em desktop, tablet e mobile (>= 320 px): em telas pequenas a sidebar colapsa para um mecanismo acessível (drawer/hambúrguer).
- [ ] Todos os textos en-us existentes preservados (botões, títulos, mensagens), salvo ajustes de microcopy sem mudança de fluxo.
- [ ] `bun run code:fix`, `bun run types:check`, `bun run test`, `bun run test:e2e` e `bun run build` passam.
- [ ] `.screenshots/` contém 14 arquivos (7 telas × `before`/`after`) nomeados `<pagina>-before.png` e `<pagina>-after.png` (ex.: `sign-in-before.png`, `sign-in-after.png`).
- [ ] As capturas `_before` foram tiradas com o código original (antes de qualquer alteração) e as `_after` com o redesign final.
- [ ] ADR novo criado em `.adrs/` registrando a decisão de migrar para shadcn/ui e o app shell.

## O que fazer

1. **Baseline antes/depois (sequência obrigatória):** antes de qualquer alteração, subir o app (`bun run dev`) e capturar as 7 telas `_before` em `.screenshots/` via skill `playwright`. A tela `home` exige sessão autenticada (ex.: logar via API e injetar o token no armazenamento usado por `setStoredToken`, ou usar conta de dev); `confirm-account` é capturada no estado estável sem token (a URL de sucesso redireciona automaticamente).
2. **Skills obrigatórias:** carregar `frontend-design` (design das telas) e `web-design-guidelines` (revisão final de acessibilidade/usabilidade). Usar a skill `shadcn` para inicializar/configurar shadcn/ui.
3. **shadcn/ui em `packages/ui`:** inicializar com tokens semânticos derivados da paleta (`DESIGN.md`), tema claro, e gerar os componentes necessários; garantir exportação por `@repo/ui`.
4. **Tokens e tipografia no `index.css`:** mapear a paleta para papéis shadcn, definir fontes (display + texto), raios, sombras e variáveis de superfície; adicionar o carregamento das fontes do Google Fonts com fallback.
5. **Refatorar auth:** `auth-shell.tsx` (novo layout com identidade visual) e as 5 páginas para usarem os componentes de `@repo/ui`, preservando estados e acessibilidade.
6. **App shell:** criar sidebar + header (ícones `lucide-react`), com colapso responsivo (drawer em mobile), e refatorar `HomePage` com um conteúdo rico (hero + placeholders de Experts/Connectors).
7. **Refazer `not-found` e `loading-screen`** no mesmo padrão.
8. **Revisão com `web-design-guidelines`** e ajustes de a11y/responsividade.
9. **Capturar `_after`** das 7 telas no estado final e conferir visualmente (abrir as imagens).
10. **QA e entregáveis:** rodar os portões de `QA.md`, ajustar testes quebrados, criar ADR e listar passos manuais de QA, arquivos modificados, bibliotecas instaladas e racional.

## O que não fazer

- Não alterar a paleta de `DESIGN.md` nem criar modo escuro.
- Não alterar fluxos, validações, contratos de API, mensagens de erro do backend nem textos en-us existentes (exceto microcopy sem mudança de fluxo).
- Não mudar rotas (`/auth/*`, `/app/*`) nem nomes de componentes exportados sem atualizar imports/testes.
- Não usar ilustrações/emojis sem licença; preferir ícones `lucide-react` (já instalado).
- Não usar a pasta padrão `output/playwright/` da skill `playwright` para as capturas — os screenshots desta spec vão em `.screenshots/` (decisão explícita do usuário).
- Não commitar `.env`.
- Não editar specs/ADRs históricos nem o template de specs.

## Decisões

| Decisão                   | Opção escolhida                                                                                                      | Racional                                                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Base de componentes       | Migrar para **shadcn/ui** em `packages/ui`                                                                           | `DESIGN_SYSTEM.md` prevê shadcn como base `[planejada]`; o redesign é o momento de cumprir o plano e dar base profissional. |
| Casa dos componentes      | `packages/ui` (`@repo/ui`)                                                                                           | Já existe no monorepo e é o destino previsto dos componentes de UI.                                                         |
| Área autenticada          | **App shell** com sidebar (Home, Experts, Connectors) + header                                                       | Dashboard profissional e navegável; fundação para as features futuras de experts/conectores.                                |
| Capturas antes/depois     | 7 telas × `_before`/`_after` em `.screenshots/`                                                                      | Pedido explícito do usuário; nomes `<pagina>-before.png` / `<pagina>-after.png`.                                            |
| Liberdade visual          | Estender dentro da paleta: Google Fonts, gradientes suaves, sombras, micro-interações                                | `DESIGN.md` fixa paleta pastel e tema claro; o restante é livre para elevar o padrão.                                       |
| Tipografia                | Display: **Sora**; texto: **Inter** (Google Fonts, fallback para fontes do sistema)                                  | Sora passa identidade moderna aos títulos; Inter garante legibilidade neutra em formulários e corpo.                        |
| Papéis de cor shadcn      | `background`→linen, `foreground`→ink, `primary`→powder-blue, `muted`→parchment, `destructive`→soft-blush/petal-frost | Mantém a paleta como fonte única de verdade e adiciona estados/derivados para os papéis semânticos.                         |
| Idioma                    | en-us preservado                                                                                                     | Regra de `DEVELOPMENT.md`.                                                                                                  |
| Tema                      | Somente claro (light)                                                                                                | Regra de `DESIGN.md`.                                                                                                       |
| Ícones                    | `lucide-react`                                                                                                       | Já instalado; consistente e leve.                                                                                           |
| Responsividade da sidebar | Colapsa para drawer acessível em telas pequenas                                                                      | Boa prática de navegação mobile sem perder acesso.                                                                          |

## Dependências

- Specs anteriores que criaram as páginas e seus testes: `004-sign-up`, `005-confirm-account`, `006-sign-in`, `007-forgot-password`, `008-reset-password` (e `003-auth-routes` para as rotas).
- Docs: `DESIGN.md` (paleta/tema), `DESIGN_SYSTEM.md` (base shadcn), `ARCHITECTURE.md` (stack do front), `DEVELOPMENT.md` (idioma, a11y, responsividade), `QA.md` (portões), `RULES.md` (workflow).
- Skills: `frontend-design`, `web-design-guidelines`, `shadcn`, `playwright`.
- Libs: shadcn/ui + dependências Radix (novas), Google Fonts (runtime), `lucide-react` (já presente).

## Riscos e trade-offs

- **Migração shadcn adiciona dependências e refatoração:** aumenta o escopo, mas cumpre o design system planejado e evita retrabalho futuro.
- **Sidebar em área com uma página real:** o menu terá placeholders; mitigado com conteúdo rico na home (preview de Experts/Connectors) para a página não parecer oca.
- **Google Fonts é dependência externa:** em caso de indisponibilidade, o fallback para fontes do sistema mantém a UI íntegra.
- **Capturas `_before` podem ser "perdidas":** se qualquer alteração rodar antes da baseline, o antes/depois fica comprometido — por isso a captura é o primeiro passo do plano.
- **Redesign pode quebrar seletores de testes/E2E:** os textos en-us e os contratos são preservados; ajustes de seletores são parte do escopo.
- **Confirm-account sem estado estável de sucesso:** a captura usa o estado de erro sem token (URL sem `token`), que é o estado renderizável estável; o fluxo de sucesso redireciona.

## Edge cases e modos de falha

- `confirm-account` sem `token` → estado de erro no novo layout (tela capturada).
- `reset-password` sem `token` → estado de erro "invalid reset link" no novo layout.
- `reset-password` com token expirado/utilizado → alertas de erro preservados no novo visual.
- `home` durante carregamento da sessão (`isLoading`) → skeleton no app shell (substitui o `LoadingScreen` quando apropriado).
- Viewport mobile → sidebar colapsada em drawer acessível; formulários de auth empilham em coluna única.
- Falha ao carregar Google Fonts → fontes de fallback do sistema.
- E2E existentes dependentes de textos (ex.: botão `Sign in`/`Sign out`) → labels en-us preservados.
- `aria-describedby`/`aria-invalid` em campos com erro → mantidos nos novos componentes de input.

## Resultado (definição de pronto)

- As 7 páginas redesenhadas com a mesma design language, consumindo componentes shadcn de `@repo/ui`.
- App shell com sidebar e header na área autenticada.
- 14 capturas em `.screenshots/` (7 telas × `_before`/`_after`), com as `_after` refletindo o redesign final.
- QA gates (`code:fix`, `types:check`, `test`, `test:e2e`, `build`) passando.
- ADR novo em `.adrs/`, passos manuais de QA, lista de arquivos modificados, bibliotecas instaladas e racional entregues (workflow `RULES.md`).

## Arquivos e diretórios envolvidos

- `packages/ui/` — `components.json`, novos componentes em `src/components/ui/*` (e/ou raiz), `src/index.ts` (exports), `package.json` (deps shadcn/Radix).
- `apps/app/src/index.css` — tokens semânticos, tipografia, sombras/raios (Tailwind v4 `@theme`).
- `apps/app/src/components/auth/auth-shell.tsx` — novo layout do shell de auth.
- `apps/app/src/pages/auth/sign-in.tsx`, `sign-up.tsx`, `forgot-password.tsx`, `reset-password.tsx`, `confirm-account.tsx`.
- `apps/app/src/pages/app/home.tsx` — refatorada sobre o app shell.
- `apps/app/src/components/app/*` — novo app shell (sidebar, header, drawer).
- `apps/app/src/components/guards/loading-screen.tsx` — novo skeleton/loading.
- `apps/app/src/pages/not-found.tsx` — redesign.
- `.screenshots/` — 14 arquivos de captura.
- `.adrs/` — novo ADR.
- `.plans/` — plano de execução (`012-ui-redesign-plan.md`).
- Testes associados (unitários de páginas em `apps/app/src/pages/**/*.test.tsx`, E2E em `apps/app/e2e/*`).
