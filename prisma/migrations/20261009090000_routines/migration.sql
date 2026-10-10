-- Routines: jobs move from Kid to Routine. Every existing kid gets a Morning
-- routine carrying the family's start/leave times and all-done bonus (its
-- current jobs move there), plus default After school and Bedtime routines.

-- CreateTable
CREATE TABLE "Routine" (
    "id" TEXT NOT NULL,
    "kidId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL DEFAULT '07:00',
    "endTime" TEXT NOT NULL DEFAULT '08:15',
    "days" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "bonus" INTEGER NOT NULL DEFAULT 3,
    "streak" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Routine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Routine_kidId_sortOrder_idx" ON "Routine"("kidId", "sortOrder");
ALTER TABLE "Routine" ADD CONSTRAINT "Routine_kidId_fkey" FOREIGN KEY ("kidId") REFERENCES "Kid"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data: one Morning routine per kid from the family settings.
INSERT INTO "Routine" ("id", "kidId", "name", "startTime", "endTime", "days", "bonus", "streak", "sortOrder")
SELECT 'rt_' || k."id", k."id", 'Morning', f."startTime", f."leaveTime", ARRAY[1,2,3,4,5], f."allDoneBonus", true, 0
FROM "Kid" k JOIN "Family" f ON f."id" = k."familyId";

INSERT INTO "Routine" ("id", "kidId", "name", "startTime", "endTime", "days", "bonus", "streak", "sortOrder")
SELECT 'ra_' || k."id", k."id", 'After school', '15:30', '18:00', ARRAY[1,2,3,4,5], 2, false, 1 FROM "Kid" k;

INSERT INTO "Routine" ("id", "kidId", "name", "startTime", "endTime", "days", "bonus", "streak", "sortOrder")
SELECT 'rb_' || k."id", k."id", 'Bedtime', '18:30', '19:30', ARRAY[0,1,2,3,4,5,6], 2, false, 2 FROM "Kid" k;

-- Default jobs for the new routines.
INSERT INTO "Task" ("id", "kidId", "label", "sortOrder", "active")
SELECT 'ta_' || k."id" || '_' || j.n, k."id", j.label, j.n, true
FROM "Kid" k, (VALUES (0, 'Homework'), (1, 'Read a book'), (2, 'Pack tomorrow''s bag')) AS j(n, label);
INSERT INTO "Task" ("id", "kidId", "label", "sortOrder", "active")
SELECT 'tb_' || k."id" || '_' || j.n, k."id", j.label, j.n, true
FROM "Kid" k, (VALUES (0, 'Bath'), (1, 'Pyjamas'), (2, 'Brush teeth'), (3, 'Story')) AS j(n, label);

-- Task: move from kid to routine.
ALTER TABLE "Task" DROP CONSTRAINT "Task_kidId_fkey";
DROP INDEX "Task_kidId_sortOrder_idx";
ALTER TABLE "Task"
  ADD COLUMN "date" TEXT,
  ADD COLUMN "days" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
  ADD COLUMN "routineId" TEXT;
UPDATE "Task" SET "routineId" = CASE
  WHEN "id" LIKE 'ta_%' THEN 'ra_' || "kidId"
  WHEN "id" LIKE 'tb_%' THEN 'rb_' || "kidId"
  ELSE 'rt_' || "kidId" END;
ALTER TABLE "Task" ALTER COLUMN "routineId" SET NOT NULL;
ALTER TABLE "Task" DROP COLUMN "kidId";
CREATE INDEX "Task_routineId_sortOrder_idx" ON "Task"("routineId", "sortOrder");
ALTER TABLE "Task" ADD CONSTRAINT "Task_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ledger: existing bonus rows belong to the Morning routine.
ALTER TABLE "LedgerEntry" ADD COLUMN "routineId" TEXT;
UPDATE "LedgerEntry" SET "routineId" = 'rt_' || "kidId" WHERE "kind" IN ('task', 'all_done', 'streak');
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Family: times and the on-time bonus now live on routines.
ALTER TABLE "Family" DROP COLUMN "allDoneBonus", DROP COLUMN "leaveTime", DROP COLUMN "startTime";
