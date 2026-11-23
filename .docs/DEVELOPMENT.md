# Desenvolvimento

Regras aplicadas em qualquer alteração de código.

> Status: `[implementado]` = já existe no repositório · `[planejado]` = parte da stack-alvo, ainda pendente.

## Princípios

- **DRY (Don't Repeat Yourself)** — não duplique lógica; reutilize.
- **Evite WET (Write Everything Twice)** — duplicação é aceita apenas quando a abstração é prematura.
- **Clean code** — código legível, bem nomeado e de fácil manutenção.
- **SOLID** — responsabilidade única, aberto/fechado, substituição de Liskov, segregação de interface e inversão de dependência.

## Arquitetura

- **Arquitetura em camadas** `[planejado]` (aplicada ao back-end):
  - `interface` — endpoints, handlers e HTTP.
  - `application` — casos de uso.
  - `domain` — entidades e serviços de domínio.
  - `infrastructure` — implementações concretas: repositórios, eventos/mensageria, filas.
- **Vertical slices** `[planejado]` — fatiar a aplicação por domínio (`products`, `checkout`, `payments`, `inventory`, `accounts`, ...).
- **Shared** `[planejado]` — lógica compartilhada vive em `src/modules/shared`.

## Idioma

- Páginas, endpoints, mensagens, emails e código são escritos em **en-us** (inglês dos Estados Unidos).
- Isso inclui: rotas (`/auth/*`, `/app/*`, `/api/v1/*`), nomes de endpoints (`sign-up`, `sign-in`, `forgot-password`, ...), labels e mensagens de UI, templates de email e identificadores de código (variáveis, funções, tabelas, colunas).
- Exceções aceitas: comentários internos de decisão e a documentação de `.docs/`, que podem ficar em português.

## Qualidade

- **TDD** `[planejado]` — desenvolver orientado a testes; ao final de cada mudança, ter testes unitários, de integração e E2E cobrindo os comportamentos.
- **O11y** `[implementado]` — observabilidade desde o dia zero com **Grafana (LGTM stack)** em `docker-compose.yml`; a integração de logs/traces dos serviços acontece junto às features.
- **A11y** — toda UI deve ser acessível.
- **Responsividade** — toda UI deve funcionar em desktop, tablet e mobile.
