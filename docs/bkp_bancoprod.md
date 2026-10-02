# Backup do banco de produção → substituir no local

Guia manual para puxar o banco SQLite de produção (Docker/Coolify) e substituir o banco da máquina local para testes com dados atualizados.

## Contexto (como o banco está montado)

- **Engine:** SQLite (`sqlite3` / node-sqlite3) com **WAL mode ligado**.
- **No servidor:** o banco roda dentro de um container Docker (Coolify), em `/app/server/data/database.sqlite`.
  - Por causa do WAL, existem 3 arquivos juntos: `database.sqlite`, `database.sqlite-wal`, `database.sqlite-shm`. As escritas mais recentes ficam no `-wal` até o checkpoint — por isso **não dá pra copiar só o `.sqlite` sem consolidar o WAL antes**.
- **No local:** `C:\Users\User\projetos\CRM\server\data\database.sqlite`.

> ⚠️ O `CONTAINER ID` muda a cada deploy do Coolify. Sempre confirme com `docker ps` antes de usar.

### Valores deste ambiente

| Item | Valor |
|------|-------|
| Host SSH | `root@srv1335937` (ou o IP do servidor) |
| Container (exemplo) | `2817ba1f1377` — **confirme com `docker ps`** |
| Banco no container | `/app/server/data/database.sqlite` (~161 MB) |
| Destino local | `C:\Users\User\projetos\CRM\server\data\database.sqlite` |

---

## Parte 1 — No servidor (via SSH)

**1. Conectar** (digita a senha):
```bash
ssh root@srv1335937
```

**2. Confirmar o `CONTAINER ID`** (pode ter mudado desde o último deploy):
```bash
docker ps
```
Pegue o `CONTAINER ID` da imagem do CRM.

**3. Consolidar o WAL e gerar o dump no `/tmp`** (troque o ID se for diferente):
```bash
# junta o WAL dentro do arquivo principal (checkpoint)
docker exec -w /app/server/data 2817ba1f1377 node -e "const s=require('sqlite3');const db=new s.Database('/app/server/data/database.sqlite');db.run('PRAGMA wal_checkpoint(TRUNCATE)',e=>{console.log('checkpoint:',e?e.message:'ok');db.close();});"

# copia o banco já consolidado pro /tmp do host
docker cp 2817ba1f1377:/app/server/data/database.sqlite /tmp/crm-dump.sqlite

# confere que gerou (deve dar ~154M)
ls -lh /tmp/crm-dump.sqlite
```
Espere o primeiro comando imprimir `checkpoint: ok`.

**4. Sair do servidor:**
```bash
exit
```

---

## Parte 2 — Na sua máquina (PowerShell)

**5. Pare o servidor local** que está usando o banco (Ctrl+C no terminal dele, ou pare o processo/PM2).
Se não parar, sobrescrever o arquivo pode **corromper** o banco.

**6. Backup do banco local atual + limpar WAL antigo**
(⚠️ apagar o `-wal`/`-shm` é obrigatório — WAL velho reaplicado no banco novo corrompe):
```powershell
cd C:\Users\User\projetos\CRM\server\data

# guarda o atual, por segurança
Copy-Item database.sqlite database.sqlite.bak -Force

# apaga o WAL/SHM antigos do banco local
Remove-Item database.sqlite-wal, database.sqlite-shm -ErrorAction SilentlyContinue
```

**7. Baixar o dump por cima** (digita a senha de novo — 2ª e última vez):
```powershell
scp root@srv1335937:/tmp/crm-dump.sqlite C:\Users\User\projetos\CRM\server\data\database.sqlite
```

**8. Validar a integridade:**
```powershell
cd C:\Users\User\projetos\CRM
node server/scripts/check-db.js
```
Se sair `integrity_check: { integrity_check: 'ok' }`, está pronto. **Suba o servidor local** de novo.

---

## Limpeza (opcional, no servidor)

Na próxima vez que conectar, apague a cópia que ficou no `/tmp`:
```bash
rm -f /tmp/crm-dump.sqlite
```

---

## Resolução de problemas

- **`docker ps` mostra outro ID:** normal após um deploy. Use o ID novo nos comandos do passo 3.
- **`checkpoint:` imprime uma mensagem de erro em vez de `ok`:** geralmente é lock temporário do banco em uso. Repita o comando; se persistir, use a alternativa read-only abaixo.
- **`scp` falhou / arquivo veio truncado:** o banco local ainda está intacto no backup. Restaure com:
  ```powershell
  Copy-Item C:\Users\User\projetos\CRM\server\data\database.sqlite.bak C:\Users\User\projetos\CRM\server\data\database.sqlite -Force
  ```
- **`integrity_check` não deu `ok`:** o dump veio corrompido (provável transferência incompleta). Refaça a Parte 2 a partir do passo 7, ou restaure o `.bak`.

### Alternativa read-only (sem escrever em produção)

Se preferir **não** rodar o checkpoint (que escreve no banco de prod), copie os 3 arquivos e deixe o SQLite reconstruir no local:

```bash
# no servidor
docker cp 2817ba1f1377:/app/server/data/database.sqlite      /tmp/database.sqlite
docker cp 2817ba1f1377:/app/server/data/database.sqlite-wal  /tmp/database.sqlite-wal
docker cp 2817ba1f1377:/app/server/data/database.sqlite-shm  /tmp/database.sqlite-shm
```
```powershell
# no local (baixa os 3 juntos; o SQLite aplica o WAL ao abrir)
scp "root@srv1335937:/tmp/database.sqlite*" C:\Users\User\projetos\CRM\server\data\
```
Nesse caso **não** apague o `-wal`/`-shm` baixados antes de abrir o banco — eles fazem parte do estado.
