# Daily Roulette

SPA para dailies con ruleta, seguimiento de bloqueos, notas y exportación por team.

## Getting Started

```bash
pnpm install
pnpm dev
```

## Prisma Scripts

```bash
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:studio
```

## Lifecycle Scripts

- `pnpm dev` ejecuta `prisma:generate` antes de arrancar.
- `pnpm build` ejecuta `prisma:generate` antes de compilar.
- `pnpm start` ejecuta `prisma:generate` antes de iniciar.
- `pnpm install` ejecuta `prisma:generate` con `postinstall`.

## Notas

- La base de datos local usa SQLite.
- El schema de Prisma vive en [`prisma/schema.prisma`](./prisma/schema.prisma).
- Los modelos generan el client en [`src/generated/prisma`](./src/generated/prisma).
