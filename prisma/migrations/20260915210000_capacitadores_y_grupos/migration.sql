-- CreateTable
CREATE TABLE "org"."trainer_profiles" (
    "user_id" INTEGER NOT NULL,
    "specialty" TEXT NOT NULL,
    "institution" TEXT,
    "bio" TEXT,
    "archived_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trainer_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "org"."groups" (
    "id" SERIAL NOT NULL,
    "documentId" UUID NOT NULL,
    "dependency_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "archived_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org"."group_members" (
    "group_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "added_by_id" INTEGER NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_members_pkey" PRIMARY KEY ("group_id","user_id")
);

-- CreateIndex
CREATE INDEX "trainer_profiles_archived_at_idx" ON "org"."trainer_profiles"("archived_at");

-- CreateIndex
CREATE UNIQUE INDEX "groups_documentId_key" ON "org"."groups"("documentId");

-- CreateIndex
CREATE INDEX "groups_dependency_id_archived_at_idx" ON "org"."groups"("dependency_id", "archived_at");

-- CreateIndex
CREATE INDEX "group_members_user_id_idx" ON "org"."group_members"("user_id");

-- AddForeignKey
ALTER TABLE "org"."trainer_profiles" ADD CONSTRAINT "trainer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org"."groups" ADD CONSTRAINT "groups_dependency_id_fkey" FOREIGN KEY ("dependency_id") REFERENCES "org"."dependencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org"."group_members" ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "org"."groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org"."group_members" ADD CONSTRAINT "group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- Invariante que Prisma no expresa.
-- ─────────────────────────────────────────────────────────────────────────────

-- Nombre de grupo único dentro de la dependencia y solo entre los activos. Un
-- @@unique de Prisma dejaría el nombre de un grupo archivado bloqueado para
-- siempre.
CREATE UNIQUE INDEX "groups_name_per_dependency"
  ON "org"."groups" ("dependency_id", "name")
  WHERE "archived_at" IS NULL;
