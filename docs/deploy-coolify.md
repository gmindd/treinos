# Deploy no Coolify — passo a passo

Resultado final: `https://treinos.pereiragabriel.com` com a app e uma base de dados Postgres no teu VPS.

São dois recursos no Coolify, no mesmo projeto:

1. **Base de dados** (Postgres), gerida pelo Coolify, com backups.
2. **App** (este repositório), construída a partir do `Dockerfile`. Um só contentor corre o site e o worker.

---

## 1. DNS

No sítio onde geres o domínio `pereiragabriel.com`:

- Cria um registo **A**: nome `treinos`, valor = **IP do VPS Contabo**.
- Se usares Cloudflare com o proxy (nuvem laranja) ligado, põe o SSL/TLS em **Full**. Também podes deixar a nuvem cinzenta até tudo funcionar.

## 2. Base de dados

1. No Coolify: **Projects → (o teu projeto) → + New → Database → PostgreSQL**.
2. Versão: a mais recente que aparecer (17 ou 18).
3. Nome: `treinos-db`. Clica **Start**.
4. Na página da base de dados copia o **Postgres URL (internal)**, que começa por `postgres://…`. É o valor de `DATABASE_URL`.
5. Separador **Backups**: ativa um backup diário (ex.: `0 3 * * *`). Se tiveres um S3 configurado no Coolify, envia para lá.

## 3. App

1. **+ New → Private Repository (with GitHub App)**. Se ainda não ligaste o GitHub ao Coolify, ele guia-te a instalar a GitHub App só no repositório `gmindd/treinos`.
2. Repositório `gmindd/treinos`, branch `main`.
3. **Build Pack: Dockerfile**.
4. **Ports Exposes**: `3000`.
5. **Domains**: `https://treinos.pereiragabriel.com`. O Coolify trata do certificado HTTPS (Let's Encrypt).
6. **Environment Variables** (marca todas como *secret*, exceto `APP_URL`):

   | Nome | Valor |
   |---|---|
   | `DATABASE_URL` | o Postgres URL (internal) do passo 2 |
   | `APP_PASSWORD` | a password com que vais entrar na app (mínimo 8 caracteres) |
   | `SESSION_SECRET` | 32+ caracteres aleatórios (ver abaixo) |
   | `APP_URL` | `https://treinos.pereiragabriel.com` |

   Para gerar o `SESSION_SECRET`, corre no teu PC:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

7. **Healthcheck**: ativa, path `/api/health`, porta `3000`.
8. **Deploy**.

O primeiro build demora uns minutos. Cada `git push` para `main` faz um deploy novo automaticamente (o webhook da GitHub App vem ativo por omissão).

## 4. Verificar (aceitação da fase 0)

- `https://treinos.pereiragabriel.com/api/health` deve mostrar `"bd":true` e `"worker":{… "ativo":true}`.
- `https://treinos.pereiragabriel.com` pede a password. Depois de entrares mostra as duas metas e "Worker: ativo".

## Se algo falhar

- **Logs** da app no Coolify: procura por `[start]` (migrações), `[worker]` e erros de `Variáveis de ambiente inválidas` (falta alguma variável).
- **"Base de dados: sem ligação"**: o `DATABASE_URL` tem de ser o URL *internal*, e a base de dados e a app têm de estar no mesmo projeto/servidor do Coolify.
- **Certificado HTTPS não sai**: o registo DNS ainda não propagou ou não aponta para o IP do VPS.
