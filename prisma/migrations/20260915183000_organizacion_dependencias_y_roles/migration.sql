-- Estructura organizativa del instituto: dependencias, bitácora de adscripción
-- y los campos de pertenencia en auth.users.
--
-- El orden de este archivo no es cosmético. El DDL va primero, la reparación de
-- los datos existentes después, y las dos invariantes que la base impone —el
-- índice único parcial del titular y el CHECK de coherencia— al final: ambas
-- exigen que las filas ya cumplan, y las cuentas que hay hoy no cumplen.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "org";

-- CreateEnum
CREATE TYPE "auth"."UserType" AS ENUM ('INTERNAL', 'EXTERNAL');

-- AlterTable
ALTER TABLE "auth"."users" ADD COLUMN     "dependency_id" INTEGER,
ADD COLUMN     "employee_number" TEXT,
ADD COLUMN     "job_title" TEXT,
ADD COLUMN     "type" "auth"."UserType" NOT NULL DEFAULT 'INTERNAL';

-- CreateTable
CREATE TABLE "org"."dependencies" (
    "id" SERIAL NOT NULL,
    "documentId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "acronym" TEXT,
    "archived_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org"."dependency_changes" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "from_dependency_id" INTEGER,
    "to_dependency_id" INTEGER NOT NULL,
    "changed_by_id" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dependency_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dependencies_documentId_key" ON "org"."dependencies"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "dependencies_name_key" ON "org"."dependencies"("name");

-- CreateIndex
CREATE INDEX "dependency_changes_user_id_createdAt_idx" ON "org"."dependency_changes"("user_id", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_number_key" ON "auth"."users"("employee_number");

-- CreateIndex
CREATE INDEX "users_dependency_id_archived_at_idx" ON "auth"."users"("dependency_id", "archived_at");

-- AddForeignKey
ALTER TABLE "auth"."users" ADD CONSTRAINT "users_dependency_id_fkey" FOREIGN KEY ("dependency_id") REFERENCES "org"."dependencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Reparación de los datos existentes.
--
-- Va en ESTE archivo y no en uno posterior para que no quede un hueco entre
-- migraciones en el que el CHECK exista y las filas no lo cumplan.
-- ─────────────────────────────────────────────────────────────────────────────

-- Dependencia de acogida para las cuentas que existían antes de que hubiera
-- dependencias. `updatedAt` se da explícito: @updatedAt de Prisma es de
-- aplicación y no deja DEFAULT en la base.
INSERT INTO "org"."dependencies" ("documentId", "name", "acronym", "updatedAt")
VALUES (gen_random_uuid(), 'Sin asignar', NULL, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- Adscribe a quien no tenga dependencia. El superadministrador es el único
-- interno exento, pero todavía no existe ninguno: la semilla lo crea después.
UPDATE "auth"."users"
SET "dependency_id" = (SELECT "id" FROM "org"."dependencies" WHERE "name" = 'Sin asignar')
WHERE "dependency_id" IS NULL
  AND "type" = 'INTERNAL'
  AND "role" <> 'SUPERADMIN';

-- Número de empleado sintético y único para las cuentas heredadas. El prefijo
-- las hace identificables: son datos a corregir, no altas reales.
UPDATE "auth"."users"
SET "employee_number" = 'MIGR-' || "id"::text
WHERE "employee_number" IS NULL
  AND "type" = 'INTERNAL';

-- `User.role` es texto libre en la base, pero a partir de ahora el mapper de
-- `users` lo valida contra la tupla al LEER: una fila con un rol desconocido
-- dejaría de mapearse y convertiría un dato sucio en un 500 en el listado.
UPDATE "auth"."users"
SET "role" = 'USER'
WHERE "role" NOT IN ('USER', 'ADMIN', 'SUPERADMIN', 'DEPENDENCY_HEAD', 'DEPENDENCY_DEPUTY');

-- ─────────────────────────────────────────────────────────────────────────────
-- Invariantes que Prisma no expresa y que no pueden quedar en la aplicación.
-- ─────────────────────────────────────────────────────────────────────────────

-- Exactamente un titular por dependencia activa. Prisma no declara índices
-- únicos parciales, y dejar esto en la aplicación abre una carrera entre dos
-- designaciones simultáneas.
CREATE UNIQUE INDEX "users_one_head_per_dependency"
  ON "auth"."users" ("dependency_id")
  WHERE "role" = 'DEPENDENCY_HEAD' AND "archived_at" IS NULL;

-- Coherencia interno/externo. El superadministrador es el único interno al que
-- no se le exige dependencia, porque su alcance es global.
ALTER TABLE "auth"."users" ADD CONSTRAINT "users_type_coherence" CHECK (
  ("type" = 'EXTERNAL' AND "dependency_id" IS NULL AND "employee_number" IS NULL)
  OR
  ("type" = 'INTERNAL' AND "employee_number" IS NOT NULL
     AND ("dependency_id" IS NOT NULL OR "role" = 'SUPERADMIN'))
);
