# Runbook — serviço fora do ar

## 1. Verifique os containers

```bash
docker compose ps
docker compose logs --tail=100 <serviço>
```

Serviços e healthchecks:

| Serviço  | Health                                               |
| -------- | ---------------------------------------------------- |
| Grafana  | `curl -s http://localhost:3001/api/health`           |
| Loki     | `curl -s http://localhost:3100/ready`                |
| Mimir    | `curl -s http://localhost:9009/ready`                |
| Tempo    | `curl -s http://localhost:3200/ready`                |
| Weaviate | `curl -s http://localhost:8080/v1/.well-known/ready` |
| agents   | `curl -s http://localhost:2024/ok`                   |
| API      | `curl -s http://localhost:3000/api/v1/auth`          |

## 2. Verifique portas e processos

```bash
ss -ltnp | grep -E ':(3000|3001|3100|3200|4318|5432|8080|9009|2024)'
```

Se a porta estiver ocupada por um processo antigo, encerre-o antes de subir o container.

## 3. Suba novamente

```bash
docker compose up -d <serviço>
docker compose ps
```

Para a API/app locais:

```bash
bun run dev
```

## 4. Causas comuns

- Container reiniciando por falta de memória: `docker inspect <container> --format '{{.State.OOMKilled}}'`.
- Dependência ainda não saudável (`depends_on`): aguarde o healthcheck.
- Porta ocupada: `ss -ltnp`.
- Volume corrompido: verifique o log antes de remover volume.

## 5. Escalação

- Infra local: dono do ambiente.
- Banco/volumes: quem administra o Docker.
- Se for produção, abra incidente e comunique o status.
