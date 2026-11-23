---
name: refactor-slices
description: Refatora vertical slices para a arquitetura em camadas com conceitos de hexagonal architecture (interface, application, domain, infrastructure). Transforma controllers em request handlers (1 endpoint = 1 classe) e services em use-cases (1 fluxo = 1 classe), com relação request handler → use-case de 1 para 1; move acesso a banco/email/token para infrastructure e regras de negócio para domain. Orquestra subagents: auditor (encontra pontos de falha), planner (monta o plano), executor (aplica), além de QA gates, commit+push e PR. Use SEMPRE que o usuário pedir para refatorar vertical slices, aplicar hexagonal/arquitetura em camadas no back-end, transformar controllers em request handlers, criar use-cases isolando fluxos, "refatora as slices", "padroniza as slices", "aplica o padrão arquitetural", "cada endpoint em uma classe", "cada fluxo em um use-case" — inclusive quando a palavra "refatorar" não aparecer mas o objetivo for alinhar slices ao padrão arquitetural do projeto.
metadata:
  author: coders-university
  version: "1.0.0"
---

# Refactor Slices

Refatora **vertical slices** que não seguem o padrão arquitetural do projeto para a **arquitetura em camadas com conceitos de hexagonal**: cada vertical ganha as camadas `interface`, `application`, `domain` e `infrastructure`. Você é o **orquestrador**: delega auditoria e planejamento a subagents dedicados, executa o plano, roda os gates de qualidade, commita/push e abre o PR.

Por que subagents: a auditoria exige varredura exaustiva (critério objetivo, sem viés do orquestrador), o planejamento exige raciocínio sobre dependências entre slices — e o orquestrador precisa de contexto livre para coordenar execução, QA e entrega.

## Convenções do projeto

- **Contexto:** `AGENTS.md` e documentos em `.docs/` (mapa em `AGENTS.md`).
- **Workflow obrigatório:** `RULES.md`.
- **QA gates:** `QA.md` (comandos na ordem lá definida).
- **Arquitetura-alvo:** `DEVELOPMENT.md` (camadas + vertical slices + shared em `modules/shared`).
- **Raiz dos módulos do back-end:** neste repo `apps/api/src/modules` (localize via glob se mudar).
- **Planos/auditoria:** `./.plans/`.
- **ADRs:** `./.adrs/*.md`.

## Arquitetura-alvo (convenções obrigatórias)

Cada vertical slice (uma por fluxo, ex.: `auth/sign-up`) fica assim:

```
modules/<domain>/<slice>/
├── application/
│   └── <slice>.use-case.ts        # @Injectable, UM método (execute), fluxo único
├── domain/
│   ├── <slice>.entity.ts          # entidade/regra pura (se houver)
│   └── <aggregate>.repository.ts  # port (interface) se houver persistência
├── infrastructure/
│   ├── <aggregate>.repository.ts  # adapter concreto (ex.: Drizzle) que implementa o port
│   └── <adapter>.ts               # transports/adapters concretos
└── interface/
    ├── <slice>.request-handler.ts # @Controller, UM endpoint, UM método (handle)
    └── <slice>.dto.ts             # validação/transform do request HTTP
```

E o `*.module.ts` da slice fica na raiz, como **composition root** (registra request handler, use-case, ports e adapters).

### Request handler pattern (camada interface)

- **1 endpoint = 1 classe.** O controller atual vira um request handler por endpoint, cada um com um único método `handle()`.
- Recebe DTO validado, chama **exatamente um** use-case, mapeia a resposta/erro HTTP.

```ts
@Controller("auth")
export class SignUpRequestHandler {
  constructor(private readonly signUp: SignUpUseCase) {}

  @Post("sign-up")
  @HttpCode(HttpStatus.CREATED)
  async handle(@Body() dto: SignUpDto): Promise<{ message: string }> {
    await this.signUp.execute(dto);
    return { message: GENERIC_RESPONSE_MESSAGE };
  }
}
```

### Use-case (camada application)

- **1 fluxo = 1 classe.** `@Injectable`, um único método público `execute()`.
- Nada de HTTP, nada de banco. Orquestra ports (de `domain`) e serviços injetados.

```ts
@Injectable()
export class SignUpUseCase {
  constructor(
    private readonly usersRepository: UsersRepository,   // port de domain
    private readonly passwordService: PasswordService,   // serviço
    private readonly emailSender: ConfirmationEmailSender, // port/adapter
  ) {}
  async execute(input: SignUpInput): Promise<void> { ... }
}
```

### Regras de dependência entre camadas

O fluxo da dependência: `interface → application → domain`; `infrastructure → domain` (adapter implementa port). A `application` conhece **ports** (interfaces), nunca a implementação concreta nem `db`/`schema` direto. Detalhes concretos (Drizzle, transports, hash, tokens) vivem em `infrastructure`/`domain`.

Não fabrique artefatos de mentira: `domain` só ganha entidade/port se existir regra ou persistência real. Camadas sem conteúdo levam um `.gitkeep` e nota no plano ("vazia por design") — a estrutura das 4 camadas fica visível.

### Nomenclatura

- `*.controller.ts` → `*.request-handler.ts` (classe `<Flow>RequestHandler`).
- `*.service.ts` que representa um fluxo → `*.use-case.ts` (classe `<Flow>UseCase`).
- DTOs ficam em `interface/`.
- Método do handler: `handle()`. Método do use-case: `execute()`.

## Catálogo de pontos de falha (checklist do auditor)

A auditoria procura, em cada slice:

1. **Estrutura ausente** — slice sem as pastas `interface/`, `application/`, `domain/`, `infrastructure/` (arquivos soltos na raiz).
2. **Controller multi-endpoint** — controller com 2+ endpoints → dividir em request handlers (1:1).
3. **Service multi-fluxo** — service com vários métodos públicos (vários fluxos) → quebrar em use-cases.
4. **Infra no application** — service/use-case acessando `db`/`DrizzleDatabase`, `db/schema`, SQL direto, enviando email, fazendo hash de senha, gerando/hasheando token.
5. **HTTP leak no application** — `BadRequestException`/`InternalServerErrorException`/`@Res`/status HTTP dentro de service/use-case (deve ficar na `interface`).
6. **DTO no lugar errado** — DTO de request com `class-validator`/`class-transformer` fora de `interface/`.
7. **Nomenclatura antiga** — arquivos `*.controller.ts` / `*.service.ts` que deveriam ser request handlers / use-cases.
8. **Import cross-layer ilegal** — `application`/`interface` importando `db`, `schema` ou implementação concreta em vez de port; `domain` importando camada externa.
9. **Regra de negócio no lugar errado** — constantes de negócio (ex.: TTL de token), normalização (ex.: email trim/lowercase), geração de token dentro de interface/application em vez de domain/infrastructure.
10. **Composition root quebrado** — `*.module.ts` registrando controller/service antigos em vez de request handler + use-case + ports/adapters.

## Fluxo

O fluxo tem 6 etapas. Apenas a **1** e a **2** são subagents obrigatórios; a **3** pode usar subagents por slice (recomendado quando as slices não colidem). As demais são suas.

### 0. Adquirir contexto

1. Leia `AGENTS.md` (raiz ou `.docs/AGENTS.md`), `RULES.md`, `DEVELOPMENT.md`, `ARCHITECTURE.md`, `QA.md`.
2. Localize a raiz dos módulos do back-end (neste repo: `apps/api/src/modules`) e liste todas as vertical slices (uma pasta por fluxo).
3. Carregue a skill `feature-concept` apenas se houver decisão de arquitetura genuinamente ambígua (ex.: onde vive uma regra) — para o restante, decida com base neste doc e registre as premissas.

### 1. Subagent auditor — encontrar pontos de falha

Spawne **um subagent** (`task`, `subagent_type: general`) com o prompt abaixo. Ele produz a auditoria em `./.plans/vertical-slice-refactor-audit.md` e retorna o caminho.

Prompt do subagent auditor (self-contained):

```
Você é o subagent auditor de uma refatoração de vertical slices para arquitetura
hexagonal em camadas no repositório <caminho-raiz>.

1. Carregue o contexto: AGENTS.md (raiz ou .docs/AGENTS.md), .docs/DEVELOPMENT.md,
   .docs/ARCHITECTURE.md.
2. Localize a raiz dos módulos do back-end (neste repo: apps/api/src/modules) e liste
   cada vertical slice (uma pasta por fluxo).
3. Para CADA slice, audite contra ESTE catálogo de pontos de falha:
   <copie o "Catálogo de pontos de falha" do SKILL.md da skill refactor-slices>
   Concretamente, leia TODOS os arquivos de cada slice (controllers, services, dtos,
   modules, specs) e registre, por slice: a estrutura atual (árvore de arquivos), cada
   ponto de falha encontrado com arquivo:linha e citação curta, e a classificação
   CONFORME (já segue o padrão) ou DESALINHADA.
4. Mapeie também as DEPENDÊNCIAS entre slices e módulos compartilhados (ex.: quem
   importa session/email/password, quem toca db/schema, quem compõe módulos em
   app.module.ts e auth.module.ts) — isso guia a ordem da refatoração.
5. NÃO altere nenhum arquivo de código. Escreva o relatório em
   ./.plans/vertical-slice-refactor-audit.md com: resumo executivo, inventário de
   slices (conforme/desalinhada), detalhamento por slice (árvore atual + pontos de
   falha com arquivo:linha), grafo de dependências e riscos. Idioma do relatório:
   pode ser pt-br (documentação interna).
6. Retorne: caminho do relatório, lista de slices desalinhadas, e os 3-5 pontos de
   falha mais críticos.
```

### 2. Subagent planner — montar o plano

Spawne **um subagent** (`task`, `subagent_type: general`) que lê a auditoria e escreve o plano. O planner não mexe em código.

Prompt do subagent planner (self-contained):

```
Você é o subagent planner de uma refatoração de vertical slices para arquitetura
hexagonal em camadas no repositório <caminho-raiz>.

1. Leia a auditoria em ./.plans/vertical-slice-refactor-audit.md e o SKILL.md da skill
   refactor-slices (seção "Arquitetura-alvo").
2. Para CADA slice desalinhada, defina a refatoração: arquivos atuais → arquivos-alvo
   (caminhos e responsabilidade de cada um), extrações de código (o que sai do
   service/controller e para onde vai: use-case, port, adapter, domain, request
   handler, dto), renomeações e o conteúdo mínimo de cada arquivo novo.
3. Defina a ORDEM de execução em ondas, respeitando dependências (módulos
   compartilhados e slices usadas por outras vêm primeiro; ex.: shared/email,
   shared/password, auth/session antes das slices de fluxo). Sinalize COLISÕES de
   arquivos entre slices da mesma onda (ex.: auth.module.ts, app.module.ts) e decida
   se serão serializadas ou resolvidas no fim.
4. Registre riscos e edge cases (testes que dependem dos arquivos renomeados —
   *.service.spec.ts e *.controller.spec.ts — devem ser migrados junto; imports em
   outros arquivos que quebram com o rename; exposições HTTP que mudam de nome de
   classe mas devem manter rota e status).
5. Escreva o plano em ./.plans/vertical-slice-refactor-plan.md: objetivo, escopo
   (slices no range), arquitetura-alvo, ondas com as slices de cada uma, passo-a-passo
   por slice (arquivos a criar/mover/renomear/alterar/remover), testes a migrar,
   riscos, critérios de aceite e checklist de QA (comandos de QA.md).
6. Retorne: caminho do plano e resumo das ondas.
```

**Apresente o plano ao usuário e aguarde aprovação** antes de executar. Pergunte também sobre o nome da branch (default: `refactor/vertical-slices-hexagonal`).

### 3. Executar o plano

1. Crie a branch aprovada (`git checkout -b <branch>`).
2. Siga as ondas do plano. Para cada onda:
   - Slices **independentes** (sem colisão de arquivos entre si): spawne **um subagent executor por slice**, em paralelo, com o prompt abaixo. Cada executor commita só os arquivos da sua slice (nunca `git add -A`).
   - Slices **acopladas** (compartilham `*.module.ts`, shared ou wiring): execute você mesmo, em série, na ordem do plano.
3. Ao final de cada slice: rode os gates de `QA.md` (seu executor reporta o resultado; você confere). Só avance de onda com a anterior verde.
4. Ao final: revise o diff completo (`git diff HEAD`) para conferir que nenhum comportamento mudou (rotas, status, mensagens, lógica) e que não sobrou lógica de infra em `application` nem HTTP leak.

Prompt do subagent executor por slice (self-contained):

```
Você é o subagent executor da slice <slice> na refatoração hexagonal do repositório
<caminho-raiz>.

1. Leia o plano em ./.plans/vertical-slice-refactor-plan.md e a seção da sua slice.
2. Leia o SKILL.md da skill refactor-slices (Arquitetura-alvo, Request handler,
   Use-case, Regras de dependência, Nomenclatura) e aplique exatamente essas
   convenções.
3. Execute a refatoração da sua slice: crie/mova/renomeie/altere/remova os arquivos
   conforme o plano, migre os testes junto (*.spec.ts), atualize imports e o
   *.module.ts da slice. NÃO toque em arquivos de outras slices nem em
   auth.module.ts/app.module.ts (o orquestrador resolve o wiring ao final da onda).
4. Rode os gates de QA.md (code:fix, types:check, test, test:e2e se aplicável, build).
   Se um gate falhar por causa do wiring ainda não atualizado, registre e siga — o
   orquestrador valida ao final da onda.
5. COMMIT (importante): faça UM commit com APENAS os arquivos da sua slice
   (`git add <caminhos explícitos>`, NUNCA `git add -A`). Mensagem Conventional
   Commits validada com `printf '%s\n' "$msg" | bunx commitlint`, ex.:
   refactor(api): move sign-up slice to hexagonal layers. Inclua o trailer
   Co-authored-by: ${OPENCODE_COAUTHOR_NAME:-OpenCode Agent} <${OPENCODE_COAUTHOR_EMAIL:-agent@opencode.ai>.
   Se houver commits novos na main, rode `git pull --rebase` antes de commitar.
6. Retorne: status (concluída/falhou), arquivos modificados, gates (cada um:
   passou/falhou), e o racional das decisões.
```

Depois de todas as ondas, atualize o wiring que ficou pendente (ex.: `auth.module.ts`, `app.module.ts`, `shared/*/module.ts`) para referenciar request handlers e use-cases, e rode os gates novamente.

### 4. Gates de qualidade

Rode na ordem de `QA.md`:

1. `bun run code:fix`
2. `bun run types:check`
3. `bun run test`
4. `bun run test:e2e` (se exigir infra, rode `bun run infra:up` antes; testes integrados podem precisar de `bun run db:migrate`)
5. `bun run build`

Se algum gate falhar, corrija antes de prosseguir. **Não declare a refatoração concluída com gates vermelhos.**

### 5. Commit e push

- Se ainda houver mudanças fora dos commits por slice (wiring final, ADR), faça um commit final seguindo a mesma convenção: Conventional Commits validado com `bunx commitlint`, co-author `OpenCode Agent` (`git commit -m "$MSG" -m "Co-authored-by: OpenCode Agent <agent@opencode.ai>"`), `git add <arquivos explícitos>`.
- Prefira o comando do projeto `/commit-and-push '<mensagem conventional>'` quando não houver commits parciais por slice a consolidar.
- Push: `git push -u origin <branch>`.

### 6. Abrir o PR

- Base: `main`. Título e body em **en-us** (idioma do projeto).
- `gh pr create --base main --head <branch> --title "<título>" --body "<body>"`.
- Body mínimo: resumo da refatoração (camadas aplicadas, request handlers, use-cases, 1:1), slices refatoradas, arquitetura-alvo, gates de QA (todos verdes), referência ao plano (`./.plans/vertical-slice-refactor-plan.md`) e ao ADR (se criado).
- Retorne a URL do PR.

## Entregáveis (conforme `RULES.md`)

Ao final, entregue: ADR em `./.adrs/*.md` para as decisões load-bearing (estrutura de camadas por slice, 1:1 request handler ↔ use-case) com resumo impresso; passos manuais de QA; arquivos modificados; libs instaladas (se houver); e o racional. Lembre que os gates de QA.md devem estar verdes.

## Verificação obrigatória

- Auditoria (`./.plans/vertical-slice-refactor-audit.md`) e plano (`./.plans/vertical-slice-refactor-plan.md`) existem e foram gerados por subagents.
- Plano aprovado pelo usuário antes de executar.
- Nenhuma slice desalinhada restante (re-auditoria rápida ao final: rodar o checklist do catálogo nas slices refatoradas).
- Gates de QA.md todos verdes.
- Commits Conventional + co-author; branch pushed; PR aberto contra `main` com URL reportada.
