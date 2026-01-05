
## Handy Recon (use if needed; otherwise ask once for minimal paths/outputs)
- `git status -sb && git branch --show-current && git describe --tags --always || true`
- `command -v tree >/dev/null && tree -a -I 'node_modules|.git|dist|build|venv|.venv|target|.next|.turbo|__pycache__' -L 3 || true`
- JS/TS: `pnpm|yarn|npm run lint && … run typecheck && … run test -i`
- Prisma/SQL (only if present): `npx prisma validate && npx prisma migrate status`
