# Treino 26/27

App pessoal de treino: prescrições do chat "Época 26/27", sincronização com o Strava, avaliação de cada treino, Fitness/Fadiga/Forma e previsões para as metas.

- Brief completo: [docs/brief.md](docs/brief.md)
- Esquema da base de dados: [docs/esquema-bd.md](docs/esquema-bd.md)
- Deploy no Coolify: [docs/deploy-coolify.md](docs/deploy-coolify.md)

## Correr no teu PC

Só precisa de Node 24 (não precisa de Docker).

1. Instalar dependências (uma vez): `npm install`
2. Criar o `.env`: copiar `.env.example` para `.env` e preencher `APP_PASSWORD` e `SESSION_SECRET`.
3. Arrancar: `npm run dev` e abrir http://localhost:3000

O `npm run dev` cria uma base de dados local em `.data/` (na primeira vez), aplica migrações e seed, e arranca o site e o worker. `Ctrl+C` pára tudo.

## Outros comandos

| Comando | Para quê |
|---|---|
| `npm test` | testes |
| `npm run typecheck` | verificação de tipos |
| `npm run build` | build de produção |
| `npm run db:generate` | gerar migração depois de mudar `src/db/schema.ts` |
