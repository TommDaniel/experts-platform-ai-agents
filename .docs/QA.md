# QA

Portões de qualidade para qualquer alteração de código. Rode na ordem abaixo antes de declarar uma mudança concluída.

> Status: `[implementado]` = scripts existentes no repositório.

## Ordem de verificação

1. Lint + formatação (`code:fix`)
2. Tipagem (`types:check`)
3. Testes unitários + integração (`test`)
4. Testes E2E (`test:e2e`)
5. Build (`build`)

## Comandos

### Lint + formatação `[implementado]`

```sh
bun run code:fix
```

### Tipagem `[implementado]`

```sh
bun run types:check
```

### Testes unitários + integração `[implementado]`

```sh
bun run test
```

### Testes E2E `[implementado]`

```sh
bun run test:e2e
```

### Build `[implementado]`

```sh
bun run build
```

## Infra local (requisito para db:migrate e testes integrados)

```sh
bun run infra:up      # sobe Postgres + LGTM (Grafana)
bun run infra:down    # derruba a infra local
bun run db:migrate    # aplica migrações no banco local (drizzle-kit migrate)
```
